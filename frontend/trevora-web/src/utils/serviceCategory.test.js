import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  recordCategories,
  recordHasCategory,
  spendByCategory,
  spendCategory,
  SMALLER_CATEGORIES,
  UNCATEGORIZED,
} from './serviceCategory';

/**
 * The category vocabulary is the backend's. These tests exist because this file
 * used to invent its own and derive it from regexes, which meant fixing the
 * classifier changed nothing an owner could see.
 */

const record = (totalCost, services) => ({ totalCost, services });
const item = (serviceCategory, lineCost, sortOrder = 0) => ({ serviceCategory, lineCost, sortOrder });

describe('spend attribution', () => {
  it('gives the whole record to its most expensive item', () => {
    // A visit that replaced a clutch and topped up washer fluid is a repair.
    const r = record(10000, [item('Maintenance', 200, 0), item('Repair', 9800, 1)]);

    expect(spendCategory(r)).toBe('Repair');
  });

  it('falls back to printed order when no item has a line cost', () => {
    // A receipt that printed only a total. Nothing to compare, so the first
    // line as printed is the closest thing to what the shop called the job.
    const r = record(3000, [item('Inspection', null, 1), item('Maintenance', null, 0)]);

    expect(spendCategory(r)).toBe('Maintenance');
  });

  it('falls back to printed order when line costs tie', () => {
    const r = record(3000, [item('Repair', 500, 2), item('Warranty', 500, 1)]);

    expect(spendCategory(r)).toBe('Warranty');
  });

  it('prefers an item that has a cost over one that does not', () => {
    const r = record(3000, [item('Maintenance', null, 0), item('Repair', 50, 1)]);

    expect(spendCategory(r)).toBe('Repair');
  });

  it('calls a record with no items uncategorised', () => {
    expect(spendCategory(record(500, []))).toBe(UNCATEGORIZED);
    expect(spendCategory(record(500, null))).toBe(UNCATEGORIZED);
  });

  it('treats a missing category on an item as uncategorised', () => {
    expect(spendCategory(record(500, [item(null, 10)]))).toBe(UNCATEGORIZED);
    expect(spendCategory(record(500, [item('  ', 10)]))).toBe(UNCATEGORIZED);
  });

  it('sums to the recorded total, never to the line costs', () => {
    /*
     * The point of single attribution. line_cost is optional and informational
     * (007:11) — here the lines add to 300 and the visit cost 10000, and the
     * chart must say 10000.
     */
    const records = [
      record(10000, [item('Repair', 100, 0), item('Maintenance', 200, 1)]),
      record(2500, [item('Maintenance', null, 0)]),
    ];

    const charted = spendByCategory(records).reduce((sum, row) => sum + row.total, 0);

    expect(charted).toBe(12500);
  });
});

describe('filter attribution', () => {
  it('returns a record under every category its items carry', () => {
    const r = record(5000, [item('Maintenance', 100, 0), item('Repair', 4900, 1)]);

    expect(recordCategories(r)).toEqual(['Maintenance', 'Repair']);
    expect(recordHasCategory(r, 'Maintenance')).toBe(true);
    expect(recordHasCategory(r, 'Repair')).toBe(true);
  });

  it('is deliberately wider than spend attribution', () => {
    // The same record is one bucket for spend and two for filtering. Both are
    // correct; they answer different questions.
    const r = record(5000, [item('Maintenance', 100, 0), item('Repair', 4900, 1)]);

    expect(spendCategory(r)).toBe('Repair');
    expect(recordCategories(r)).toHaveLength(2);
  });

  it('does not repeat a category carried by two items', () => {
    const r = record(5000, [item('Repair', 100, 0), item('Repair', 200, 1)]);

    expect(recordCategories(r)).toEqual(['Repair']);
  });
});

describe('chart shaping', () => {
  const bigAndSmall = [
    record(9000, [item('Maintenance', 9000, 0)]),
    record(100, [item('Warranty', 100, 0)]),
    record(100, [item('Emergency', 100, 0)]),
  ];

  it('sorts descending and folds the sub-3% tail into one row', () => {
    const rows = spendByCategory(bigAndSmall);

    expect(rows[0].name).toBe('Maintenance');
    expect(rows.map((row) => row.name)).toContain(SMALLER_CATEGORIES);
    expect(rows.map((row) => row.name)).not.toContain('Warranty');
    expect(rows.find((row) => row.name === SMALLER_CATEGORIES).total).toBe(200);
  });

  it('never folds UNCATEGORIZED into the tail, however small', () => {
    // The pipeline health signal. Hiding it when it is small hides exactly the
    // state worth noticing early.
    const rows = spendByCategory([...bigAndSmall, record(50, [item(null, null, 0)])]);
    const uncategorised = rows.find((row) => row.name === UNCATEGORIZED);

    expect(uncategorised).toBeDefined();
    expect(uncategorised.total).toBe(50);
    expect(uncategorised.percent).toBeLessThan(3);
    expect(rows.find((row) => row.name === SMALLER_CATEGORIES).total).toBe(200);
  });

  it('always shows UNCATEGORIZED, including at zero', () => {
    const rows = spendByCategory([record(9000, [item('Maintenance', 9000, 0)])]);
    const uncategorised = rows.find((row) => row.name === UNCATEGORIZED);

    expect(uncategorised).toBeDefined();
    expect(uncategorised.total).toBe(0);
  });

  it('never labels a bucket "Other"', () => {
    // "Other" is a real category a person can choose. A tail bucket wearing the
    // same name is two different things in one chart.
    const rows = spendByCategory([...bigAndSmall, record(80, [item('Other', 80, 0)])]);

    expect(rows.map((row) => row.name)).not.toContain('Other');
    expect(rows.map((row) => row.label)).not.toContain('Other');
  });

  it('labels UNCATEGORIZED in words, not in shouting case', () => {
    const rows = spendByCategory([record(10, [item(null, null, 0)])]);

    expect(rows.find((row) => row.name === UNCATEGORIZED).label).toBe('Not categorised');
  });
});

describe('no local derivation survives', () => {
  it('no frontend file derives a category from keywords', () => {
    /*
     * The regression this whole change exists to prevent. Any reappearance of a
     * keyword table producing category names means the frontend has started
     * disagreeing with the backend again, silently.
     */
    const banned = [/Tires\s*&\s*brakes/, /CATEGORY_RULES/, /categoryForRecord/];
    const offenders = [];

    const walk = (dir) => {
      readdirSync(dir).forEach((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return walk(path);
        if (!/\.(js|jsx)$/.test(entry)) return;
        if (entry === 'serviceCategory.test.js') return;
        // Comments stripped first: `serviceCategory.js` documents why
        // "Tires & brakes" was removed, and that history is worth keeping.
        // This is about code that derives, not prose that explains.
        const code = readFileSync(path, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1');
        banned.forEach((pattern) => {
          if (pattern.test(code)) offenders.push(`${path} matches ${pattern}`);
        });
      });
    };
    walk(join(process.cwd(), 'src'));

    expect(offenders).toEqual([]);
  });
});
