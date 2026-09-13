// Client-side receipt image prep before OCR upload: downscale/compress large photos,
// and look at how well each page is likely to read -- too small, too dark or glary,
// blurry -- so owners can retake before the request ever reaches the backend.
// Redrawing through a canvas also leaves the photo's EXIF (GPS included) behind; the
// fallbacks, which keep the original file, strip it without re-encoding instead.

import { stripImageMetadata } from './stripImageMetadata';

export const RECEIPT_IMAGE_MAX_EDGE = 2000;
export const RECEIPT_IMAGE_QUALITY = 0.85;

const SHARPNESS_SAMPLE_EDGE = 400;

/*
 * The limits a page is judged against. They are the defaults of the server's own
 * gate (ReceiptImageQualityGate, trevora.receipt.quality-gate.* in
 * application.properties), measured the same way at the same sample size, so the
 * screen and the server agree. Change one, change both: a page this screen calls
 * fine that the server then stops is the worst version of this feature.
 */
export const RECEIPT_QUALITY_LIMITS = Object.freeze({
  minLongEdge: 800,
  minSharpness: 45,
  minBrightness: 50,
  maxBrightness: 245,
  minContrast: 15,
});

const NOT_MEASURED = Object.freeze({ sharpness: null, brightness: null, contrast: null });

export async function prepareReceiptFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const measured = measureQuality(bitmap, bitmap.width, bitmap.height);
    const issues = qualityIssues({ width: bitmap.width, height: bitmap.height, ...measured });
    const canvas = drawToCanvas(bitmap, bitmap.width, bitmap.height, RECEIPT_IMAGE_MAX_EDGE);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, RECEIPT_IMAGE_QUALITY);
    if (!blob) {
      return { file: await stripImageMetadata(file), issues, sharpness: measured.sharpness };
    }

    return {
      file: new File([blob], toJpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() }),
      issues,
      sharpness: measured.sharpness,
    };
  } catch {
    // Formats the browser can't decode (e.g. some HEIC files) fall back to the original file,
    // minus its metadata where that can be removed losslessly. They are not judged: a page this
    // screen cannot open is not one it knows anything about. stripImageMetadata never throws.
    return { file: await stripImageMetadata(file), issues: [], sharpness: null };
  }
}

export async function prepareCanvasCapture(sourceCanvas) {
  const measured = measureQuality(sourceCanvas, sourceCanvas.width, sourceCanvas.height);
  const issues = qualityIssues({ width: sourceCanvas.width, height: sourceCanvas.height, ...measured });
  const canvas = drawToCanvas(sourceCanvas, sourceCanvas.width, sourceCanvas.height, RECEIPT_IMAGE_MAX_EDGE);
  const blob = await canvasToBlob(canvas, RECEIPT_IMAGE_QUALITY);
  return { blob, issues, sharpness: measured.sharpness };
}

/**
 * How a photo is likely to read, without changing it. For pages that are uploaded
 * exactly as they are -- a photo from the phone's own camera app -- so they are
 * warned about like every other page. Never throws; a file the browser cannot
 * decode has no issues.
 */
export async function assessReceiptFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const measured = measureQuality(bitmap, bitmap.width, bitmap.height);
    const issues = qualityIssues({ width: bitmap.width, height: bitmap.height, ...measured });
    bitmap.close?.();
    return issues;
  } catch {
    return [];
  }
}

/**
 * The problems a page's measurements add up to, most fundamental first -- the order
 * the screen names them in, and the server's too. Too small comes first because
 * moving closer fixes the rest; bad light before blur because a dark or glare-washed
 * photo also measures soft, and "hold steady" would not fix it. A value that could
 * not be measured is not held against the page.
 */
export function qualityIssues({ width, height, sharpness, brightness, contrast }, limits = RECEIPT_QUALITY_LIMITS) {
  const issues = [];
  if (Number.isFinite(width) && Number.isFinite(height) && Math.max(width, height) < limits.minLongEdge) {
    issues.push('LOW_RESOLUTION');
  }
  if (Number.isFinite(brightness) && Number.isFinite(contrast)
    && (brightness < limits.minBrightness || brightness > limits.maxBrightness || contrast < limits.minContrast)) {
    issues.push('POOR_LIGHTING');
  }
  if (Number.isFinite(sharpness) && sharpness < limits.minSharpness) {
    issues.push('BLURRY');
  }
  return issues;
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

// Laplacian-variance sharpness (low variance in the edge response means a flat,
// out-of-focus image), plus the mean and spread of the gray levels, all taken from one
// small downsampled grayscale copy so it stays cheap.
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

    const gray = new Float32Array(sampleWidth * sampleHeight);
    let levelSum = 0;
    let levelSumSq = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      levelSum += gray[p];
      levelSumSq += gray[p] * gray[p];
    }
    const brightness = levelSum / gray.length;
    const contrast = Math.sqrt(Math.max(0, levelSumSq / gray.length - brightness * brightness));

    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 1; y < sampleHeight - 1; y += 1) {
      for (let x = 1; x < sampleWidth - 1; x += 1) {
        const idx = y * sampleWidth + x;
        const laplacian = gray[idx - 1] + gray[idx + 1] + gray[idx - sampleWidth] + gray[idx + sampleWidth] - 4 * gray[idx];
        sum += laplacian;
        sumSq += laplacian * laplacian;
        count += 1;
      }
    }
    if (count === 0) return { sharpness: null, brightness, contrast };
    const mean = sum / count;
    return { sharpness: sumSq / count - mean * mean, brightness, contrast };
  } catch {
    return NOT_MEASURED;
  }
}

function toJpegName(name) {
  const base = (name || 'receipt').replace(/\.[a-z0-9]+$/i, '');
  return `${base}.jpg`;
}
