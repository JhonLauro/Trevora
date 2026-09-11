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
/* A plain helper gets its `t` from the file's import, so that is a file-level
   fact, not something visible inside the function.

   Matched inside an actual import statement, not anywhere in the file. A bare
   /translate as t/ is satisfied by a *comment* saying the words — which is
   exactly how this check first passed against code that was still broken, the
   comment above the import having been written in the same edit as the fix. */
const IMPORT_STATEMENT = /import\s*\{[\s\S]*?\}\s*from[^\n]*/g;
const TRANSLATE_AS_T = /\btranslate\s+as\s+t\b/;
/* `t` among the parameters: (issue, t), ({ t }), (a, t = translate). */
const TAKES_T = /(^|[,{\s])t(\s*[,=}]|\s*$)/;

for (const file of sources) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const importsTranslate = (source.match(IMPORT_STATEMENT) ?? [])
    .some((statement) => TRANSLATE_AS_T.test(statement));
  /* Every top-level function ends the previous one, whatever its name. Both
     kinds are checked, but against different rules — a component holds the
     hook, a plain function cannot and must be handed `t` some other way.
     Keeping the two ideas apart matters: treating only PascalCase as a
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
    const body = lines.slice(starts[i], starts[i + 1]).join('\n');
    if (!CALLS.test(body)) continue;
    const where = `${file.replace(SRC, 'src')}:${starts[i] + 1}`;

    if (/^[A-Z]/.test(name)) {
      if (DECLARES.test(body)) continue;
      problems.push(`calls t() without useT(): ${name} in ${where}`);
      continue;
    }

    /* camelCase: a plain helper. This used to be skipped outright, on the
       assumption that such a function "takes `translate as t` from the module
       import" — an assumption nothing verified. AccountSettingsPage did not
       have that import, so `changeCountLabel` called a `t` that existed only
       inside the component below it, and every notification toggle threw
       "t is not defined". The assumption is now the check.

       Three ways to be legitimate: the file imports translate as t, the
       function is handed t as a parameter, or it is a custom hook holding the
       hook itself. */
    if (importsTranslate || DECLARES.test(body)) continue;
    let signature = header;
    for (let k = starts[i]; !signature.includes(')') && k + 1 < lines.length; k += 1) {
      signature += lines[k + 1];
    }
    const params = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
    if (TAKES_T.test(params)) continue;
    problems.push(`calls t() with no t in scope: ${name}() in ${where}`);
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
