import { getActiveCurrentUser } from './currentUser.js';
import { requireSupabaseClient, supabase } from './supabaseClient.js';

export const RECEIPT_BUCKET = import.meta.env.VITE_SUPABASE_RECEIPT_BUCKET ?? 'service-receipts';

export async function uploadReceiptImage({ vehicleId, receiptImage }) {
  const [page] = await uploadReceiptPages({ vehicleId, pages: [receiptImage] });
  return {
    bucket: page.bucket,
    path: page.path,
    originalFilename: page.originalFilename,
    contentType: page.contentType,
  };
}

/**
 * @param onPageStored called with (storedCount, totalCount) after each page
 *     lands. Pages upload one at a time, so this is a real count of work
 *     finished rather than an estimate of it.
 */
export async function uploadReceiptPages({ vehicleId, pages, onPageStored }) {
  const client = requireSupabaseClient();
  const currentUser = getActiveCurrentUser();
  if (!currentUser?.userId) {
    throw new Error('Sign in before uploading a receipt.');
  }

  const uploaded = [];
  for (const [index, page] of pages.entries()) {
    const file = page.file ?? page;
    const pageNumber = page.pageNumber ?? index + 1;
    const path = [
      currentUser.userId,
      vehicleId,
      `${new Date().toISOString().replace(/[:.]/g, '-')}-page-${pageNumber}-${randomId()}-${safeFileName(file.name)}`,
    ].join('/');

    const { error } = await client.storage
      .from(RECEIPT_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || undefined,
        upsert: false,
      });

    if (error) {
      await Promise.all(uploaded.map((item) => removeStoredReceipt(item)));
      throw new Error(error.message || 'Could not upload receipt to Supabase Storage.');
    }

    uploaded.push({
      pageNumber,
      bucket: RECEIPT_BUCKET,
      path,
      originalFilename: file.name,
      contentType: file.type || 'application/octet-stream',
    });
    onPageStored?.(uploaded.length, pages.length);
  }

  return uploaded;
}

export async function createReceiptSignedUrl(source, expiresIn = 3600) {
  if (!supabase || !source?.receiptStoragePath) {
    return '';
  }

  const bucket = source.receiptStorageBucket || RECEIPT_BUCKET;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(source.receiptStoragePath, expiresIn);

  if (error) {
    throw new Error(error.message || 'Could not load receipt image.');
  }

  return data?.signedUrl || '';
}

export async function removeStoredReceipt(source) {
  if (!supabase || !source?.path) {
    return;
  }

  await supabase.storage
    .from(source.bucket || RECEIPT_BUCKET)
    .remove([source.path]);
}

function safeFileName(fileName = 'receipt') {
  const trimmed = fileName.trim() || 'receipt';
  return trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'receipt';
}

function randomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
