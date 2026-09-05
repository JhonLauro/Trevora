import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasOpenConcerns,
  openConcernCount,
  openConcerns,
  resolvedConcerns,
} from './concerns';
import { noticedAgo } from './noticedAgo';

const open = (note) => ({ concernId: note, note, createdAt: '2026-09-01T00:00:00Z', resolvedAt: null });
const done = (note) => ({ ...open(note), resolvedAt: '2026-09-05T00:00:00Z' });

describe('open and resolved', () => {
  const list = [open('AC not cold'), done('rattle from the boot'), open('pulls left')];

  it('counts open only, so the badge does not climb when something is fixed', () => {
    expect(openConcernCount(list)).toBe(2);
  });

  it('resolving one lowers the count rather than leaving it', () => {
    const after = [open('AC not cold'), done('rattle from the boot'), done('pulls left')];

    expect(openConcernCount(after)).toBe(1);
  });

  it('keeps resolved concerns available, just not counted', () => {
    expect(resolvedConcerns(list).map((c) => c.note)).toEqual(['rattle from the boot']);
    expect(openConcerns(list).map((c) => c.note)).toEqual(['AC not cold', 'pulls left']);
  });

  it('survives a missing or malformed list', () => {
    expect(openConcernCount(undefined)).toBe(0);
    expect(openConcernCount(null)).toBe(0);
    expect(openConcerns('not a list')).toEqual([]);
  });

  it('asks on the confirmation screen only when something is open', () => {
    expect(hasOpenConcerns(list)).toBe(true);
    expect(hasOpenConcerns([done('rattle from the boot')])).toBe(false);
    expect(hasOpenConcerns([])).toBe(false);
  });
});

describe('when it was noticed', () => {
  // The mechanic reads these, and "3 weeks ago" versus "yesterday" changes what
  // they check first.
  const now = new Date('2026-09-06T12:00:00Z').getTime();
  const ago = (ms) => noticedAgo(new Date(now - ms).toISOString(), now);

  it('reads coarsely, in words', () => {
    expect(ago(10 * 60 * 1000)).toBe('just now');
    expect(ago(3 * 60 * 60 * 1000)).toBe('3 hours ago');
    expect(ago(30 * 60 * 60 * 1000)).toBe('yesterday');
    expect(ago(4 * 24 * 60 * 60 * 1000)).toBe('4 days ago');
    expect(ago(21 * 24 * 60 * 60 * 1000)).toBe('3 weeks ago');
    expect(ago(80 * 24 * 60 * 60 * 1000)).toBe('2 months ago');
    expect(ago(400 * 24 * 60 * 60 * 1000)).toBe('a year ago');
  });

  it('treats a clock running ahead as just now, not as the future', () => {
    expect(noticedAgo(new Date(now + 5 * 60 * 1000).toISOString(), now)).toBe('just now');
  });

  it('says nothing when there is no date', () => {
    expect(noticedAgo(null)).toBe('');
    expect(noticedAgo('not a date')).toBe('');
  });
});

describe('concerns stay unclassified', () => {
  /*
   * The rule the whole feature exists to protect, on the frontend side. A
   * concern is the one thing here the owner states directly; running it through
   * the category vocabulary or the component matcher turns it back into a guess.
   * That is the WASTE PAD bug (migration 011) in a new axis.
   */
  const CONCERN_FILES = [
    'utils/concerns.js',
    'utils/noticedAgo.js',
    'api/concerns.js',
    'components/ConcernsPanel.jsx',
  ];

  const FORBIDDEN = [
    /serviceCategory/,
    /categoryLabel/,
    /recordCategories/,
    /componentEvidenceText/,
    /COMPONENT_RULES/,
    /relatedComponents/,
    /classif/i,
  ];

  it('no concern file reads a category or attributes a component', () => {
    const offenders = [];
    CONCERN_FILES.forEach((relative) => {
      const code = readFileSync(join(process.cwd(), 'src', relative), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      FORBIDDEN.forEach((pattern) => {
        if (pattern.test(code)) offenders.push(`${relative} matches ${pattern}`);
      });
    });

    expect(offenders).toEqual([]);
  });

  it('the concern API module talks to the concerns endpoint and nothing else', () => {
    const code = readFileSync(join(process.cwd(), 'src', 'api', 'concerns.js'), 'utf8');

    expect(code).not.toMatch(/service-drafts|\/history|classif/i);
  });

  it('no file outside the concern feature imports the concern API', () => {
    /*
     * Reads of concerns should stay on the three screens that own them. A
     * fourth caller appearing is the moment someone starts deriving something
     * from concern text somewhere it cannot be reviewed.
     */
    const allowed = new Set([
      'pages/VehiclePage.jsx',
      'pages/ServiceRecordConfirmationPage.jsx',
    ]);
    const importers = [];

    const walk = (dir, prefix = '') => {
      readdirSync(dir).forEach((entry) => {
        const path = join(dir, entry);
        const relative = prefix ? `${prefix}/${entry}` : entry;
        if (statSync(path).isDirectory()) return walk(path, relative);
        if (!/\.(js|jsx)$/.test(entry)) return;
        const code = readFileSync(path, 'utf8');
        if (/from '\.\.?\/(\.\.\/)?api\/concerns'/.test(code)) importers.push(relative);
      });
    };
    walk(join(process.cwd(), 'src'));

    importers.forEach((file) => expect(allowed.has(file)).toBe(true));
  });
});
