import { describe, expect, it } from 'vitest';
import { RECEIPT_QUALITY_LIMITS, qualityIssues } from './receiptImage';

const good = { width: 1500, height: 2000, sharpness: 900, brightness: 210, contrast: 55 };

describe('qualityIssues', () => {
  it('passes a sharp, evenly lit, full-size page', () => {
    expect(qualityIssues(good)).toEqual([]);
  });

  it('names a blurry page', () => {
    expect(qualityIssues({ ...good, sharpness: 20 })).toEqual(['BLURRY']);
  });

  it('names a dark page, a washed-out page and a flat one', () => {
    expect(qualityIssues({ ...good, brightness: 30 })).toEqual(['POOR_LIGHTING']);
    expect(qualityIssues({ ...good, brightness: 250 })).toEqual(['POOR_LIGHTING']);
    expect(qualityIssues({ ...good, contrast: 6 })).toEqual(['POOR_LIGHTING']);
  });

  it('judges size by the long edge, so a long narrow receipt is not too small', () => {
    expect(qualityIssues({ ...good, width: 600, height: 450 })).toEqual(['LOW_RESOLUTION']);
    expect(qualityIssues({ ...good, width: 700, height: 2000 })).toEqual([]);
  });

  it('puts the most fundamental problem first', () => {
    expect(qualityIssues({ width: 600, height: 400, sharpness: 10, brightness: 30, contrast: 5 }))
      .toEqual(['LOW_RESOLUTION', 'POOR_LIGHTING', 'BLURRY']);
  });

  it('does not hold what it could not measure against the page', () => {
    expect(qualityIssues({ width: 1500, height: 2000, sharpness: null, brightness: null, contrast: null }))
      .toEqual([]);
  });

  it('uses the same limits as the server defaults in application.properties', () => {
    expect({ ...RECEIPT_QUALITY_LIMITS }).toEqual({
      minLongEdge: 800,
      minSharpness: 45,
      minBrightness: 50,
      maxBrightness: 245,
      minContrast: 15,
    });
  });
});
