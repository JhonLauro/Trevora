import { describe, expect, it } from 'vitest';
import { DOCUMENT_MIN_MARKS, RECEIPT_QUALITY_LIMITS, measureGray, qualityMeters, qualityVerdict } from './receiptImage';

const good = {
  width: 1500,
  height: 2000,
  relativeSharpness: 6,
  isotropy: 0.85,
  clippedShare: 0,
  brightness: 180,
  contrast: 70,
};
const clean = { issues: [], warnings: [] };

describe('qualityVerdict', () => {
  it('passes a sharp, evenly lit, full-size page', () => {
    expect(qualityVerdict(good)).toEqual(clean);
  });

  it('warns about a slightly blurry page before it stops a very blurry one', () => {
    expect(qualityVerdict({ ...good, relativeSharpness: 2 })).toEqual({ issues: [], warnings: ['BLURRY'] });
    expect(qualityVerdict({ ...good, relativeSharpness: 0.5 })).toEqual({ issues: ['BLURRY'], warnings: [] });
  });

  it('catches shake by the direction of the edges, even when the page still measures sharp', () => {
    expect(qualityVerdict({ ...good, isotropy: 0.65 })).toEqual({ issues: [], warnings: ['BLURRY'] });
    expect(qualityVerdict({ ...good, isotropy: 0.55 })).toEqual({ issues: ['BLURRY'], warnings: [] });
  });

  it('only warns about a dark or faint page, and stops only a black frame', () => {
    // Vision read receipts at brightness 14 and with print faded to a spread of 6.
    expect(qualityVerdict({ ...good, brightness: 15 })).toEqual({ issues: [], warnings: ['POOR_LIGHTING'] });
    expect(qualityVerdict({ ...good, contrast: 6 })).toEqual({ issues: [], warnings: ['POOR_LIGHTING'] });
    expect(qualityVerdict({ ...good, brightness: 5 })).toEqual({ issues: ['POOR_LIGHTING'], warnings: [] });
  });

  it('never stops a page for glare, however much', () => {
    expect(qualityVerdict({ ...good, clippedShare: 0.9 })).toEqual({ issues: [], warnings: ['GLARE'] });
  });

  it('judges size by the long edge: warns when small, stops when tiny, passes a long narrow receipt', () => {
    expect(qualityVerdict({ ...good, width: 600, height: 450 })).toEqual({ issues: [], warnings: ['LOW_RESOLUTION'] });
    expect(qualityVerdict({ ...good, width: 380, height: 300 })).toEqual({ issues: ['LOW_RESOLUTION'], warnings: [] });
    expect(qualityVerdict({ ...good, width: 700, height: 2000 })).toEqual(clean);
  });

  it('puts the most fundamental problem first in each list', () => {
    expect(qualityVerdict({ ...good, width: 380, height: 300, brightness: 15, relativeSharpness: 0.5, clippedShare: 0.5 }))
      .toEqual({ issues: ['LOW_RESOLUTION', 'BLURRY'], warnings: ['POOR_LIGHTING', 'GLARE'] });
  });

  it('does not hold what it could not measure against the page', () => {
    expect(qualityVerdict({
      width: 1500, height: 2000, relativeSharpness: null, isotropy: null, clippedShare: null, brightness: null, contrast: null,
    })).toEqual(clean);
  });

  it('uses the same limits as the server defaults (ReceiptImageQualityGate.Limits)', () => {
    expect({ ...RECEIPT_QUALITY_LIMITS }).toEqual({
      warnMinLongEdge: 650,
      blockMinLongEdge: 400,
      warnMinBrightness: 20,
      blockMinBrightness: 8,
      warnMinContrast: 8,
      warnClippedShare: 0.15,
      warnMinRelativeSharpness: 2.5,
      blockMinRelativeSharpness: 1.0,
      warnMinIsotropy: 0.68,
      blockMinIsotropy: 0.6,
    });
  });
});

/* A page of "print": short dark strokes, some across and some down, spaced like
   characters on light paper, so it has edges every way the way text does. The
   same strokes every run: a fixed-seed generator, not Math.random. */
const SIZE = 120;
function page({ paper = 235, ink = 20 } = {}) {
  let seed = 7;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const gray = new Float64Array(SIZE * SIZE).fill(paper);
  for (let y = 6; y < SIZE - 12; y += 12) {
    for (let x = 6; x < SIZE - 12; x += 9) {
      const down = next() < 0.5;
      const length = 5 + Math.floor(next() * 5);
      for (let a = 0; a < length; a += 1) {
        for (let b = 0; b < 2; b += 1) {
          gray[(down ? y + a : y + b) * SIZE + (down ? x + b : x + a)] = ink;
        }
      }
    }
  }
  return gray;
}
/* Averages each pixel with its neighbours along one axis. */
function smear(gray, reach, horizontal) {
  const out = new Float64Array(gray.length);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let sum = 0;
      let count = 0;
      for (let d = -reach; d <= reach; d += 1) {
        const xs = horizontal ? x + d : x;
        const ys = horizontal ? y : y + d;
        if (xs >= 0 && xs < SIZE && ys >= 0 && ys < SIZE) {
          sum += gray[ys * SIZE + xs];
          count += 1;
        }
      }
      out[y * SIZE + x] = sum / count;
    }
  }
  return out;
}
/* Out of focus: smeared both ways. Shaken: smeared one way only. */
const blurred = (gray, reach) => smear(smear(gray, reach, true), reach, false);
const shaken = (gray, reach) => smear(gray, reach, true);

describe('measureGray', () => {
  it('scores a blurred page as less sharp than the same page in focus', () => {
    const sharp = measureGray(page(), SIZE, SIZE);
    const soft = measureGray(blurred(page(), 2), SIZE, SIZE);
    expect(soft.relativeSharpness).toBeLessThan(sharp.relativeSharpness / 2);
  });

  it('does not call faint print blurry: sharpness is measured relative to the print contrast', () => {
    const strong = measureGray(page({ ink: 20 }), SIZE, SIZE);
    const faint = measureGray(page({ ink: 200 }), SIZE, SIZE);
    expect(faint.sharpness).toBeLessThan(strong.sharpness / 10);
    expect(Math.abs(faint.relativeSharpness - strong.relativeSharpness) / strong.relativeSharpness).toBeLessThan(0.1);
  });

  it('sees shake as edges that all point one way, and blur as not shake', () => {
    const still = measureGray(page(), SIZE, SIZE);
    const soft = measureGray(blurred(page(), 2), SIZE, SIZE);
    const moved = measureGray(shaken(page(), 4), SIZE, SIZE);
    expect(still.isotropy).toBeGreaterThan(0.8);
    expect(soft.isotropy).toBeGreaterThan(0.6);
    expect(moved.isotropy).toBeLessThan(0.3);
  });

  it('counts pixels blown out to white', () => {
    const gray = page();
    gray.fill(255, 0, (SIZE * SIZE) / 2);
    expect(measureGray(gray, SIZE, SIZE).clippedShare).toBeGreaterThan(0.45);
    expect(measureGray(page(), SIZE, SIZE).clippedShare).toBe(0);
  });

  it('never calls a blank frame shaken, and does not divide by nothing', () => {
    const blank = measureGray(new Float64Array(SIZE * SIZE).fill(128), SIZE, SIZE);
    expect(blank.isotropy).toBe(1);
    expect(Number.isFinite(blank.relativeSharpness)).toBe(true);
  });
});

describe('qualityMeters', () => {
  const byKey = (meters) => Object.fromEntries(meters.map((m) => [m.key, m]));

  it('agrees with the verdict on every measure: the meters can never say something the card does not', () => {
    const cases = [
      good,
      { ...good, relativeSharpness: 2 },
      { ...good, relativeSharpness: 0.5 },
      { ...good, isotropy: 0.55 },
      { ...good, brightness: 5 },
      { ...good, contrast: 6 },
      { ...good, clippedShare: 0.4 },
      { ...good, width: 380, height: 300 },
    ];
    for (const measured of cases) {
      const { issues, warnings } = qualityVerdict(measured);
      const zones = qualityMeters(measured).map((m) => m.zone);
      expect(zones.includes('block')).toBe(issues.length > 0);
      expect(zones.includes('warn') || zones.includes('block')).toBe(issues.length + warnings.length > 0);
    }
  });

  it('puts the block line left of the warn line, and a good photo right of both', () => {
    for (const meter of qualityMeters(good)) {
      expect(meter.zone).toBe('ok');
      if (meter.blockAt != null) expect(meter.blockAt).toBeLessThan(meter.warnAt);
      expect(meter.position).toBeGreaterThan(meter.warnAt);
    }
  });

  it('draws glare the other way round: none is the good end, and it never blocks', () => {
    const clear = byKey(qualityMeters({ ...good, clippedShare: 0 })).glare;
    const washed = byKey(qualityMeters({ ...good, clippedShare: 0.9 })).glare;
    expect(clear.position).toBe(1);
    expect(washed.position).toBe(0);
    expect(washed.zone).toBe('warn');
    expect(washed.blockAt).toBeNull();
  });

  it('leaves out what was not measured, and draws nothing for an unopened file', () => {
    expect(qualityMeters(null)).toEqual([]);
    const keys = qualityMeters({ width: 1500, height: 2000 }).map((m) => m.key);
    expect(keys).toEqual(['size']);
  });
});

describe('no receipt in the photo', () => {
  it('stops a photo with almost no printed marks, and passes one with enough', () => {
    expect(qualityVerdict({ ...good, marks: 0 })).toEqual({ issues: ['NO_DOCUMENT'], warnings: [] });
    expect(qualityVerdict({ ...good, marks: DOCUMENT_MIN_MARKS })).toEqual(clean);
  });

  it('says it before anything else, even on a photo that is also blurry', () => {
    expect(qualityVerdict({ ...good, marks: 0, isotropy: 0.3 }))
      .toEqual({ issues: ['NO_DOCUMENT', 'BLURRY'], warnings: [] });
    expect(qualityVerdict({ ...good, marks: 0, clippedShare: 0.5 }).issues[0]).toBe('NO_DOCUMENT');
  });

  it('counts the characters of a page of print, and none on a plain picture', () => {
    expect(measureGray(page(), SIZE, SIZE).marks).toBeGreaterThan(20);
    const picture = new Float64Array(SIZE * SIZE).fill(200);
    for (let y = 30; y < 90; y += 1) for (let x = 20; x < 100; x += 1) picture[y * SIZE + x] = 60;
    expect(measureGray(picture, SIZE, SIZE).marks).toBeLessThan(DOCUMENT_MIN_MARKS);
  });

  it('shows the count as a meter that agrees with the warning', () => {
    const meter = qualityMeters({ ...good, marks: 0 }).find((m) => m.key === 'marks');
    expect(meter.zone).toBe('block');
    expect(qualityMeters({ ...good, marks: 50 }).find((m) => m.key === 'marks').zone).toBe('ok');
  });
});
