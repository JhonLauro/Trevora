import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripImageMetadata, stripMetadataFromBytes } from './stripImageMetadata';

/*
 * The fixtures are synthetic: generated images with made-up GPS and camera
 * values, never a real photograph or a real place. Every piece of metadata in
 * them carries the text LEAKCHECK, so "none of it survived" is a single search
 * rather than a list of fields that could quietly fall out of date.
 */
const fixture = (name) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));
const text = (bytes) => Buffer.from(bytes).toString('latin1');

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Header segments up to the first scan, and everything from that scan on. */
function jpegParts(bytes) {
  const segments = [];
  let pos = 2;
  while (pos < bytes.length) {
    const marker = bytes[pos + 1];
    if (marker === 0xda) return { segments, scan: bytes.subarray(pos) };
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    segments.push({ marker, bytes: bytes.subarray(pos, pos + 2 + length) });
    pos += 2 + length;
  }
  throw new Error('no scan found');
}

/* What a decoder actually reads: every header segment outside the APPn range
   and comments. If these and the scan data are byte-identical, decoding is. */
const decoderSegments = (parts) => parts.segments
  .filter((segment) => (segment.marker < 0xe0 || segment.marker > 0xef) && segment.marker !== 0xfe)
  .map((segment) => segment.bytes);

function pngChunks(bytes) {
  const chunks = [];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length = bytes[pos] * 16777216 + (bytes[pos + 1] << 16) + (bytes[pos + 2] << 8) + bytes[pos + 3];
    const type = text(bytes.subarray(pos + 4, pos + 8));
    chunks.push({ type, data: bytes.subarray(pos + 8, pos + 8 + length) });
    pos += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

/* Written out by hand from the EXIF spec rather than taken from the module, so
   this checks the module against the format instead of against itself. */
const ORIENTATION_SIX = Uint8Array.of(
  0xff, 0xe1, 0x00, 0x22,
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  0x00, 0x01,
  0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
);

describe('JPEG: a rotated camera photo carrying location', () => {
  const original = fixture('rotated-with-location.jpg');
  const result = stripMetadataFromBytes(original);

  it('really does carry metadata before stripping', () => {
    expect(text(original)).toContain('LEAKCHECK');
  });

  it('removes location, camera, XMP, IPTC and comment metadata', () => {
    expect(result.format).toBe('jpeg');
    expect(result.changed).toBe(true);
    expect(text(result.bytes).includes('LEAKCHECK')).toBe(false);
  });

  it('keeps the rotation, so the photo still shows the right way up', () => {
    expect(jpegParts(result.bytes).segments[0].bytes).toEqual(ORIENTATION_SIX);
  });

  it('leaves everything the decoder reads byte-for-byte identical', () => {
    const before = jpegParts(original);
    const after = jpegParts(result.bytes);
    expect(decoderSegments(after)).toEqual(decoderSegments(before));
    expect(after.scan).toEqual(before.scan.subarray(0, after.scan.length));
  });

  it('keeps the colour profile exactly', () => {
    const before = jpegParts(original).segments.find((s) => s.marker === 0xe2 && text(s.bytes).includes('ICC_PROFILE'));
    const after = jpegParts(result.bytes).segments.find((s) => s.marker === 0xe2);
    expect(Boolean(before)).toBe(true);
    expect(after.bytes).toEqual(before.bytes);
  });

  it('drops data appended after the image, such as a motion photo video', () => {
    expect(result.bytes[result.bytes.length - 2]).toBe(0xff);
    expect(result.bytes[result.bytes.length - 1]).toBe(0xd9);
    expect(result.bytes.length).toBeLessThan(original.length);
  });

  it('changes nothing on a second pass', () => {
    const again = stripMetadataFromBytes(result.bytes);
    expect(again.changed).toBe(false);
    expect(again.bytes).toBe(result.bytes);
  });
});

describe('JPEG: an upright photo carrying location', () => {
  const original = fixture('upright-with-location.jpg');
  const result = stripMetadataFromBytes(original);

  it('removes the metadata and writes no rotation, because none is needed', () => {
    expect(result.changed).toBe(true);
    expect(text(result.bytes).includes('LEAKCHECK')).toBe(false);
    const parts = jpegParts(result.bytes);
    expect(parts.segments.some((s) => s.marker === 0xe1)).toBe(false);
  });

  it('keeps JFIF first and the decoder data identical', () => {
    const before = jpegParts(original);
    const after = jpegParts(result.bytes);
    expect(after.segments[0].marker).toBe(0xe0);
    expect(decoderSegments(after)).toEqual(decoderSegments(before));
    expect(after.scan).toEqual(before.scan);
  });
});

describe('JPEG: files that must come back untouched', () => {
  it('returns an already-clean photo as the same array, not a copy', () => {
    const clean = fixture('already-clean.jpg');
    const result = stripMetadataFromBytes(clean);
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(clean);
  });

  it('leaves a file alone when its rotation cannot be read, rather than risk turning it sideways', () => {
    const clean = fixture('already-clean.jpg');
    // "Exif\0\0" followed by an invalid byte order.
    const unreadable = Uint8Array.of(0xff, 0xe1, 0x00, 0x0c, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x58, 0x58, 0x00, 0x2a);
    const input = concat(clean.subarray(0, 2), unreadable, clean.subarray(2));
    const result = stripMetadataFromBytes(input);
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(input);
  });

  it('leaves a truncated file alone', () => {
    const truncated = fixture('truncated.jpg');
    const result = stripMetadataFromBytes(truncated);
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(truncated);
  });
});

describe('JPEG: segments added to a clean file are removed exactly', () => {
  const clean = fixture('already-clean.jpg');
  const parts = jpegParts(clean);

  it('a multi-picture index and trailing data strip back to the original file', () => {
    const mpf = Uint8Array.of(0xff, 0xe2, 0x00, 0x08, 0x4d, 0x50, 0x46, 0x00, 0x00, 0x00);
    const trailer = new TextEncoder().encode('LEAKCHECK-TRAILER');
    const input = concat(clean.subarray(0, 2), ...parts.segments.map((s) => s.bytes), mpf, parts.scan, trailer);
    expect(stripMetadataFromBytes(input).bytes).toEqual(clean);
  });

  it('a rotation placed before JFIF is moved after it', () => {
    const input = concat(clean.subarray(0, 2), ORIENTATION_SIX, ...parts.segments.map((s) => s.bytes), parts.scan);
    const after = jpegParts(stripMetadataFromBytes(input).bytes);
    expect(after.segments[0].marker).toBe(0xe0);
    expect(after.segments[1].bytes).toEqual(ORIENTATION_SIX);
  });

  it('a rotation already right after JFIF is left exactly where it is', () => {
    const [jfif, ...rest] = parts.segments.map((s) => s.bytes);
    const input = concat(clean.subarray(0, 2), jfif, ORIENTATION_SIX, ...rest, parts.scan);
    const result = stripMetadataFromBytes(input);
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(input);
  });
});

describe('PNG', () => {
  it('removes eXIf and text chunks and keeps the pixel data and colour profile', () => {
    const original = fixture('with-location.png');
    const result = stripMetadataFromBytes(original);
    expect(result.format).toBe('png');
    expect(result.changed).toBe(true);
    expect(text(result.bytes).includes('LEAKCHECK')).toBe(false);

    const types = pngChunks(result.bytes).map((chunk) => chunk.type);
    expect(types.includes('eXIf')).toBe(false);
    expect(types.includes('tEXt')).toBe(false);
    expect(types.includes('iCCP')).toBe(true);
    expect(types[types.length - 1]).toBe('IEND');

    const idat = (bytes) => pngChunks(bytes).filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data);
    expect(idat(result.bytes)).toEqual(idat(original));
  });

  it('leaves a rotated PNG alone', () => {
    const rotated = fixture('rotated.png');
    const result = stripMetadataFromBytes(rotated);
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(rotated);
  });
});

describe('other formats', () => {
  it('passes HEIC through untouched', () => {
    const heic = fixture('not-handled.heic');
    const result = stripMetadataFromBytes(heic);
    expect(result.format).toBe('other');
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(heic);
  });
});

describe('stripImageMetadata', () => {
  it('returns a File with the same name, type and date, minus the metadata', async () => {
    const file = new File([fixture('rotated-with-location.jpg')], 'receipt.jpg', {
      type: 'image/jpeg',
      lastModified: 1700000000000,
    });
    const out = await stripImageMetadata(file);
    expect(out).toBeInstanceOf(File);
    expect(out.name).toBe('receipt.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(out.lastModified).toBe(1700000000000);
    expect(out.size).toBeLessThan(file.size);
    expect(text(new Uint8Array(await out.arrayBuffer())).includes('LEAKCHECK')).toBe(false);
  });

  it('hands back the very same File when there is nothing to remove', async () => {
    const file = new File([fixture('already-clean.jpg')], 'car.jpg', { type: 'image/jpeg' });
    expect(await stripImageMetadata(file)).toBe(file);
  });

  it('never throws, whatever it is given', async () => {
    expect(await stripImageMetadata(null)).toBe(null);
    const odd = {};
    expect(await stripImageMetadata(odd)).toBe(odd);
  });
});
