// Client-side receipt image prep before OCR upload: downscale/compress large photos,
// and look at how well each page is likely to read, so owners can retake before the
// request ever reaches the backend. Redrawing through a canvas also leaves the photo's
// EXIF (GPS included) behind; the fallbacks, which keep the original file, strip it
// without re-encoding instead.

import { stripImageMetadata } from './stripImageMetadata';

export const RECEIPT_IMAGE_MAX_EDGE = 2000;
export const RECEIPT_IMAGE_QUALITY = 0.85;

const SHARPNESS_SAMPLE_EDGE = 400;
/* Half the width of the local mean subtracted to find the print's own contrast:
   a 9x9 window on the 400px copy. Same as DETAIL_RADIUS in ReceiptImageQualityGate. */
const DETAIL_RADIUS = 4;

/*
 * Where a page is warned about, and where it is stopped. These are the defaults of
 * the server's own gate (ReceiptImageQualityGate.Limits, trevora.receipt.quality-gate.*
 * in application.properties), measured the same way at the same sample size, so the
 * screen and the server agree. Change one, change both: a page this screen calls fine
 * that the server then stops is the worst version of this feature.
 *
 * The lines were found by running Google Vision over receipts degraded a step at a
 * time (planning/DEFERRED.md, "Receipt quality gate calibrated against Vision"). Vision
 * reads far worse photos than a person would guess, so most problems only warn: the
 * page will probably read, but some of it may be misread. Only a tiny image, a black
 * frame, and heavy blur or shake stop a page.
 */
export const RECEIPT_QUALITY_LIMITS = Object.freeze({
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

/*
 * Fewer small, separate marks than this and the photo has no printed text to speak
 * of: a car, a face, a sky. Browser-only -- the server judges the text Vision reads
 * instead (ReceiptTextCheck). Every one of 335 test receipts, however damaged, had 7
 * or more (typically 70); flat pictures had 0 or 1. It stops the page, like heavy
 * blur: it was a warning at first, and a selfie then went on to cost a Vision call
 * only for the server to refuse it as NO_TEXT. The owner can still read it anyway.
 */
export const DOCUMENT_MIN_MARKS = 2;

const NOT_MEASURED = Object.freeze({
  sharpness: null,
  marks: null,
  relativeSharpness: null,
  isotropy: null,
  clippedShare: null,
  brightness: null,
  contrast: null,
});

export async function prepareReceiptFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const measured = { width: bitmap.width, height: bitmap.height, ...measureQuality(bitmap, bitmap.width, bitmap.height) };
    const { issues, warnings } = qualityVerdict(measured);
    const canvas = drawToCanvas(bitmap, bitmap.width, bitmap.height, RECEIPT_IMAGE_MAX_EDGE);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, RECEIPT_IMAGE_QUALITY);
    if (!blob) {
      return { file: await stripImageMetadata(file), issues, warnings, sharpness: measured.sharpness, measured };
    }

    return {
      file: new File([blob], toJpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() }),
      issues,
      warnings,
      sharpness: measured.sharpness,
      measured,
    };
  } catch {
    // Formats the browser can't decode (e.g. some HEIC files) fall back to the original file,
    // minus its metadata where that can be removed losslessly. They are not judged: a page this
    // screen cannot open is not one it knows anything about. stripImageMetadata never throws.
    return { file: await stripImageMetadata(file), issues: [], warnings: [], sharpness: null, measured: null };
  }
}

export async function prepareCanvasCapture(sourceCanvas) {
  const measured = {
    width: sourceCanvas.width,
    height: sourceCanvas.height,
    ...measureQuality(sourceCanvas, sourceCanvas.width, sourceCanvas.height),
  };
  const { issues, warnings } = qualityVerdict(measured);
  const canvas = drawToCanvas(sourceCanvas, sourceCanvas.width, sourceCanvas.height, RECEIPT_IMAGE_MAX_EDGE);
  const blob = await canvasToBlob(canvas, RECEIPT_IMAGE_QUALITY);
  return { blob, issues, warnings, sharpness: measured.sharpness, measured };
}

/**
 * How a photo is likely to read, without changing it. For pages that are uploaded
 * exactly as they are -- a photo from the phone's own camera app -- so they are
 * warned about like every other page. Never throws; a file the browser cannot
 * decode is not judged.
 *
 * @returns {{ issues: string[], warnings: string[], measured: object|null }}
 */
export async function assessReceiptFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const measured = { width: bitmap.width, height: bitmap.height, ...measureQuality(bitmap, bitmap.width, bitmap.height) };
    bitmap.close?.();
    return { ...qualityVerdict(measured), measured };
  } catch {
    return { issues: [], warnings: [], measured: null };
  }
}

/**
 * What a page's measurements add up to: `issues` stop it (in the server's enforce
 * mode, and in the confirm dialog here), `warnings` are only said. Each list is most
 * fundamental first -- too small before bad light before blur, because moving closer
 * fixes the rest and a dark photo also measures soft. A page stopped for a problem is
 * not also warned about it, and a value that could not be measured is not held against
 * the page. Mirrors ReceiptImageQualityGate.assess.
 */
export function qualityVerdict(
  { width, height, relativeSharpness, isotropy, clippedShare, brightness, contrast, marks },
  limits = RECEIPT_QUALITY_LIMITS,
) {
  const issues = [];
  const warnings = [];
  const judge = (block, warn, code) => {
    if (block) issues.push(code);
    else if (warn) warnings.push(code);
  };
  const known = Number.isFinite;

  // First, because it is the question before all the others: whether there is a
  // receipt in the photo at all. Not part of the server's gate.
  if (known(marks)) {
    judge(marks < DOCUMENT_MIN_MARKS, false, 'NO_DOCUMENT');
  }

  if (known(width) && known(height)) {
    const longEdge = Math.max(width, height);
    judge(longEdge < limits.blockMinLongEdge, longEdge < limits.warnMinLongEdge, 'LOW_RESOLUTION');
  }
  if (known(brightness) && known(contrast)) {
    judge(
      brightness < limits.blockMinBrightness,
      brightness < limits.warnMinBrightness || contrast < limits.warnMinContrast,
      'POOR_LIGHTING',
    );
  }
  if (known(clippedShare)) {
    judge(false, clippedShare >= limits.warnClippedShare, 'GLARE');
  }
  if (known(relativeSharpness) && known(isotropy)) {
    judge(
      relativeSharpness < limits.blockMinRelativeSharpness || isotropy < limits.blockMinIsotropy,
      relativeSharpness < limits.warnMinRelativeSharpness || isotropy < limits.warnMinIsotropy,
      'BLURRY',
    );
  }
  return { issues, warnings };
}

/*
 * Each measure drawn as a track from bad (left) to good (right), with the warn and
 * block lines of RECEIPT_QUALITY_LIMITS on it. `span` is only how much of the scale
 * the track shows; the zone is decided by the same comparisons as qualityVerdict, so
 * the meter and the verdict can never disagree.
 */
const METERS = [
  {
    key: 'marks',
    value: (m) => m.marks,
    span: [0, 40],
    warn: () => DOCUMENT_MIN_MARKS,
    block: () => DOCUMENT_MIN_MARKS,
  },
  {
    key: 'sharpness',
    value: (m) => m.relativeSharpness,
    span: [0, 6],
    warn: (l) => l.warnMinRelativeSharpness,
    block: (l) => l.blockMinRelativeSharpness,
  },
  {
    key: 'steadiness',
    value: (m) => m.isotropy,
    span: [0.4, 1],
    warn: (l) => l.warnMinIsotropy,
    block: (l) => l.blockMinIsotropy,
  },
  {
    key: 'light',
    value: (m) => m.brightness,
    span: [0, 80],
    warn: (l) => l.warnMinBrightness,
    block: (l) => l.blockMinBrightness,
  },
  {
    key: 'contrast',
    value: (m) => m.contrast,
    span: [0, 40],
    warn: (l) => l.warnMinContrast,
    block: () => null,
  },
  {
    key: 'glare',
    value: (m) => m.clippedShare,
    span: [0.5, 0],
    warn: (l) => l.warnClippedShare,
    block: () => null,
    higherIsWorse: true,
  },
  {
    key: 'size',
    value: (m) => (Number.isFinite(m.width) && Number.isFinite(m.height) ? Math.max(m.width, m.height) : null),
    span: [0, 1500],
    warn: (l) => l.warnMinLongEdge,
    block: (l) => l.blockMinLongEdge,
  },
];

/**
 * Where a photo sits on each measure, for drawing: `position`, `warnAt` and `blockAt`
 * run 0 (bad end) to 1 (good end), and `zone` is 'ok', 'warn' or 'block'. A measure
 * that could not be taken is left out.
 */
export function qualityMeters(measured, limits = RECEIPT_QUALITY_LIMITS) {
  if (!measured) return [];
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return METERS.flatMap((meter) => {
    const value = meter.value(measured);
    if (!Number.isFinite(value)) return [];
    const [from, to] = meter.span;
    const at = (x) => (x == null ? null : clamp((x - from) / (to - from)));
    const warn = meter.warn(limits);
    const block = meter.block(limits);
    const zone = meter.higherIsWorse
      ? (value >= warn ? 'warn' : 'ok')
      : block != null && value < block ? 'block' : value < warn ? 'warn' : 'ok';
    return [{ key: meter.key, value, position: at(value), warnAt: at(warn), blockAt: at(block), zone }];
  });
}

/**
 * Every measurement, from a grayscale copy (luma 0-255, row by row). Pure, so it can
 * be tested without a canvas, and the same maths as ReceiptImageQualityGate:
 *
 *  - brightness, contrast: mean and spread of the gray levels;
 *  - sharpness: variance of the 4-neighbour Laplacian over the interior;
 *  - relativeSharpness: sharpness over the variance of the fine detail (each pixel
 *    minus its 9x9 neighbourhood mean). Edge strength scales with the print's
 *    contrast, so the raw number called faint or dark pages blurry, and the plain
 *    spread counted a shadow across the page as contrast;
 *  - isotropy: how evenly the strongest tenth of Sobel gradients point in every
 *    direction (smaller over larger eigenvalue of their structure tensor). Print has
 *    edges every way; a shaken photo keeps only the ones along the shake;
 *  - clippedShare: share of pixels blown out to white (254 or above).
 */
export function measureGray(gray, width, height) {
  const n = width * height;
  if (!n || gray.length < n) return NOT_MEASURED;

  let levelSum = 0;
  let levelSumSq = 0;
  let clipped = 0;
  for (let i = 0; i < n; i += 1) {
    levelSum += gray[i];
    levelSumSq += gray[i] * gray[i];
    if (gray[i] >= 254) clipped += 1;
  }
  const brightness = levelSum / n;
  const contrast = Math.sqrt(Math.max(0, levelSumSq / n - brightness * brightness));

  let lapSum = 0;
  let lapSumSq = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const laplacian = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      lapSum += laplacian;
      lapSumSq += laplacian * laplacian;
      lapCount += 1;
    }
  }
  const sharpness = lapCount === 0 ? 0 : lapSumSq / lapCount - (lapSum / lapCount) ** 2;
  const detail = Math.max(detailContrast(gray, width, height), 1);

  return {
    sharpness,
    relativeSharpness: sharpness / (detail * detail),
    isotropy: isotropy(gray, width, height),
    clippedShare: clipped / n,
    brightness,
    contrast,
    marks: printedMarks(gray, width, height),
  };
}

/*
 * How many small, separate marks the photo has -- roughly, printed characters. The
 * strong edges (at least 30% of the 99th-percentile Sobel magnitude) are grouped into
 * 8-connected blobs, and blobs of 3 to 150 pixels on the 400px sample are counted.
 * The outline of a car or a face is one long blob and is not; a letter is a few
 * small ones.
 */
function printedMarks(gray, width, height) {
  if (width < 3 || height < 3) return 0;
  const w = width - 2;
  const h = height - 2;
  const magnitude = new Float64Array(w * h);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const dx = (gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1])
        - (gray[i - width - 1] + 2 * gray[i - 1] + gray[i + width - 1]);
      const dy = (gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1])
        - (gray[i - width - 1] + 2 * gray[i - width] + gray[i - width + 1]);
      magnitude[(y - 1) * w + (x - 1)] = Math.hypot(dx, dy);
    }
  }
  const sorted = Float64Array.from(magnitude).sort();
  const top = sorted[Math.floor(0.99 * (sorted.length - 1))];
  if (!(top > 0)) return 0;
  const cut = 0.3 * top;

  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let marks = 0;
  for (let start = 0; start < w * h; start += 1) {
    if (seen[start] || magnitude[start] < cut) continue;
    seen[start] = 1;
    let size = 0;
    let depth = 0;
    stack[depth++] = start;
    while (depth > 0) {
      const p = stack[--depth];
      size += 1;
      const px = p % w;
      const py = (p - px) / w;
      for (let ny = Math.max(0, py - 1); ny <= Math.min(h - 1, py + 1); ny += 1) {
        for (let nx = Math.max(0, px - 1); nx <= Math.min(w - 1, px + 1); nx += 1) {
          const q = ny * w + nx;
          if (!seen[q] && magnitude[q] >= cut) {
            seen[q] = 1;
            stack[depth++] = q;
          }
        }
      }
    }
    if (size >= 3 && size <= 150) marks += 1;
  }
  return marks;
}

function detailContrast(gray, width, height) {
  const stride = width + 1;
  const table = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += gray[y * width + x];
      table[(y + 1) * stride + x + 1] = table[y * stride + x + 1] + row;
    }
  }
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - DETAIL_RADIUS);
    const y1 = Math.min(height, y + DETAIL_RADIUS + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - DETAIL_RADIUS);
      const x1 = Math.min(width, x + DETAIL_RADIUS + 1);
      const window = table[y1 * stride + x1] - table[y0 * stride + x1] - table[y1 * stride + x0] + table[y0 * stride + x0];
      const d = gray[y * width + x] - window / ((y1 - y0) * (x1 - x0));
      sum += d;
      sumSq += d * d;
    }
  }
  const n = width * height;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
}

function isotropy(gray, width, height) {
  if (width < 3 || height < 3) return 1;
  const n = (width - 2) * (height - 2);
  const gx = new Float64Array(n);
  const gy = new Float64Array(n);
  const magnitude = new Float64Array(n);
  let k = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const w = width;
      const dx = (gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1]) - (gray[i - w - 1] + 2 * gray[i - 1] + gray[i + w - 1]);
      const dy = (gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1]) - (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1]);
      gx[k] = dx;
      gy[k] = dy;
      magnitude[k] = Math.hypot(dx, dy);
      k += 1;
    }
  }
  const sorted = Float64Array.from(magnitude).sort();
  const cut = sorted[Math.floor(0.9 * (n - 1))];
  if (!(cut > 0)) return 1;
  let jxx = 0;
  let jyy = 0;
  let jxy = 0;
  for (let i = 0; i < n; i += 1) {
    if (magnitude[i] >= cut) {
      jxx += gx[i] * gx[i];
      jyy += gy[i] * gy[i];
      jxy += gx[i] * gy[i];
    }
  }
  const trace = jxx + jyy;
  const spread = Math.sqrt(Math.max(trace * trace / 4 - (jxx * jyy - jxy * jxy), 0));
  const larger = trace / 2 + spread;
  const smaller = trace / 2 - spread;
  return larger <= 0 ? 1 : Math.max(0, smaller) / larger;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function drawToCanvas(source, width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  canvas.getContext('2d').drawImage(source, 0, 0, targetWidth, targetHeight);
  return canvas;
}

// One small grayscale copy, drawn at the same 400px the server samples at, so the
// numbers agree; measureGray does the rest.
function measureQuality(source, width, height) {
  try {
    const scale = Math.min(1, SHARPNESS_SAMPLE_EDGE / Math.max(width, height));
    const sampleWidth = Math.max(3, Math.round(width * scale));
    const sampleHeight = Math.max(3, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

    const gray = new Float64Array(sampleWidth * sampleHeight);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    return measureGray(gray, sampleWidth, sampleHeight);
  } catch {
    return NOT_MEASURED;
  }
}

function toJpegName(name) {
  const base = (name || 'receipt').replace(/\.[a-z0-9]+$/i, '');
  return `${base}.jpg`;
}

