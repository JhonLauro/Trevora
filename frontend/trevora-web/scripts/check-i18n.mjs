/**
 * Three ways a translated app breaks that a build will not tell you about.
 * All three shipped at least once while this was being written.
 *
 * <p><b>1. A key that exists in English and nowhere else.</b> The fallback
 * serves the English string, so it looks right to whoever is testing, and
 * shows as a raw "garage.scrollLeft" only to the people reading Cebuano.
 *
 * <p><b>2. A component that calls t() without holding it.</b> Vite compiles it
 * happily -- `t` is a free identifier -- so the first sign is a white screen
 * on whichever route renders that component.
 *
 * <p><b>3. t() called from module-level data.</b> `const RANGES = [{ label:
 * t('x') }]` runs at import time, when nothing is mounted and `t` is not
 * bound. This one does not even degrade: the module throws on load and the
 * whole route dies before a single element renders. Hold the key in the data
 * and translate at render, the way NAV_ITEMS does.
 *
 * <p>Run with: npm run check:i18n  (also runs automatically before a build)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const LOCALES = join(SRC, 'i18n', 'locales');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const catalogues = Object.fromEntries(
  readdirSync(LOCALES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(LOCALES, f), 'utf8'))]),
);

const sources = walk(SRC).filter((f) => /\.jsx?$/.test(f));
const problems = [];
const english = new Set(Object.keys(catalogues.en ?? {}));

// ---- 1. every key used is defined, in every language ----------------------
const used = new Set();
for (const file of sources) {
  for (const [, key] of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) {
    used.add(key);
  }
}
for (const [, key] of [...used].map((k) => [0, k]).sort()) {
  if (!english.has(key)) problems.push(`used but missing from en: ${key}`);
}
for (const [code, catalogue] of Object.entries(catalogues)) {
  if (code === 'en') continue;
  const keys = new Set(Object.keys(catalogue));
  for (const key of english) if (!keys.has(key)) problems.push(`missing from ${code}: ${key}`);
  for (const key of keys) if (!english.has(key)) problems.push(`in ${code} but not en (stale?): ${key}`);
}

// ---- 2. every component that calls t() holds one --------------------------
const DECLARES = /const\s+t\s*=\s*useT\(\)|const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useLanguage\(\)|translate as t/;
/* Any t( call. Matching only t('literal') missed t(item.labelKey), so a
   component that translates a key held in a variable looked hookless-free
   to this check while throwing at runtime. */
const CALLS = /(?<![\w.])t\(/;
for (const file of sources) {
  const lines = readFileSync(file, 'utf8').split('\n');
  /* Every top-level function ends the previous one, whatever its name. Only
     PascalCase ones are *reported* — a camelCase function is a plain helper,
     which cannot hold a hook and takes `translate as t` from the module import.
     Keeping those two ideas apart matters: treating only PascalCase as a
     boundary let a helper's t() calls bleed into the component declared above
     it, and blamed that component for calls it never made. */
  const starts = [];
  lines.forEach((line, i) => {
    if (/^(export default |export )?function [A-Za-z_]/.test(line)) starts.push(i);
  });
  if (!starts.length) continue;
  starts.push(lines.length);
  for (let i = 0; i < starts.length - 1; i += 1) {
    const header = lines[starts[i]];
    /* Strip the keywords whether or not the function is exported. Matching only
       the exported form left "function ShellNav" as the name, which fails the
       PascalCase test below and silently skipped every unexported component. */
    const name = header.trim().split('(')[0]
      .replace(/^export\s+/, '').replace(/^default\s+/, '').replace(/^function\s+/, '').trim();
    if (!/^[A-Z]/.test(name)) continue;
    const body = lines.slice(starts[i], starts[i + 1]).join('\n');
    if (!CALLS.test(body) || DECLARES.test(body)) continue;
    problems.push(`calls t() without useT(): ${name} in ${file.replace(SRC, 'src')}`);
  }
}

// ---- 3. nothing calls t() or plural() from module-level data --------------
const TOP_DECL = /^(?:export\s+)?(?:default\s+)?(const|let|var|function|class)\s/;
const ANY_CALL = /(?<![\w.'"`])(?:t|plural)\(/;
for (const file of sources) {
  const lines = readFileSync(file, 'utf8').split('\n');
  /* Comments explaining this very rule contain the text "t()", so the scan has
     to see code only. Tracked crudely rather than parsed: a line inside a block
     comment, opening one, or starting with // is not code. */
  let inBlock = false;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const opens = trimmed.includes('/*');
    const closes = trimmed.includes('*/');
    const wasInBlock = inBlock;
    if (opens && !closes) inBlock = true;
    else if (closes) inBlock = false;
    if (wasInBlock || opens || trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (!ANY_CALL.test(line)) return;
    for (let j = i; j >= 0; j -= 1) {
      const match = TOP_DECL.exec(lines[j]);
      if (!match) continue;
      if (match[1] === 'const' || match[1] === 'let' || match[1] === 'var') {
        problems.push(`t()/plural() in module-level data: ${file.replace(SRC, 'src')}:${i + 1}`);
      }
      return;
    }
  });
}

if (problems.length) {
  console.error(`i18n check failed (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`i18n ok - ${used.size} keys used, ${english.size} defined, languages: ${Object.keys(catalogues).join(', ')}`);
