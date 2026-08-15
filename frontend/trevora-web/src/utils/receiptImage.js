// Client-side receipt image prep before OCR upload: downscale/compress large photos
// and flag blurry captures so owners can retake before the request ever reaches the backend.

export const RECEIPT_IMAGE_MAX_EDGE = 2000;
export const RECEIPT_IMAGE_QUALITY = 0.85;

const SHARPNESS_SAMPLE_EDGE = 400;
const BLUR_VARIANCE_THRESHOLD = 45;

export async function prepareReceiptFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const sharpness = measureSharpness(bitmap, bitmap.width, bitmap.height);
    const canvas = drawToCanvas(bitmap, bitmap.width, bitmap.height, RECEIPT_IMAGE_MAX_EDGE);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, RECEIPT_IMAGE_QUALITY);
    if (!blob) {
      return { file, isBlurry: false, sharpness: null };
    }

    return {
      file: new File([blob], toJpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() }),
      isBlurry: isBlurry(sharpness),
      sharpness,
    };
  } catch {
    // Formats the browser can't decode (e.g. some HEIC files) fall back to the original file untouched.
    return { file, isBlurry: false, sharpness: null };
  }
}

export async function prepareCanvasCapture(sourceCanvas) {
  const sharpness = measureSharpness(sourceCanvas, sourceCanvas.width, sourceCanvas.height);
  const canvas = drawToCanvas(sourceCanvas, sourceCanvas.width, sourceCanvas.height, RECEIPT_IMAGE_MAX_EDGE);
  const blob = await canvasToBlob(canvas, RECEIPT_IMAGE_QUALITY);
  return { blob, isBlurry: isBlurry(sharpness), sharpness };
}

function isBlurry(sharpness) {
  return typeof sharpness === 'number' && sharpness < BLUR_VARIANCE_THRESHOLD;
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

// Laplacian-variance sharpness estimate: low variance in the edge response means a flat,
// out-of-focus image. Computed on a small downsampled grayscale copy so it stays cheap.
function measureSharpness(source, width, height) {
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
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }

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
    if (count === 0) return null;
    const mean = sum / count;
    return sumSq / count - mean * mean;
  } catch {
    return null;
  }
}

function toJpegName(name) {
  const base = (name || 'receipt').replace(/\.[a-z0-9]+$/i, '');
  return `${base}.jpg`;
}
