import { getActiveCurrentUser } from './currentUser.js';
import { requireSupabaseClient } from './supabaseClient.js';

/**
 * Photos of a vehicle, stored the way receipts are rather than the way profile
 * photos are.
 *
 * <p>The difference is deliberate. `profile-photos` is public-read because an
 * avatar carries nothing private and is drawn on every screen. A photo of a
 * car is usually a photo of its plate, generally taken where the car is kept,
 * and the same picture can end up in front of a mechanic who scanned a QR
 * code. So this bucket is private and the app renders a signed URL that
 * expires, exactly like `service-receipts`.
 *
 * <p>What is stored on the vehicle is the bucket and the path, never a URL —
 * a signed URL would be stale within the hour.
 */
export const VEHICLE_PHOTO_BUCKET =
  import.meta.env.VITE_SUPABASE_VEHICLE_PHOTO_BUCKET ?? 'vehicle-photos';

/** A phone photo comfortably fits; a raw DSLR frame is rejected before it
 *  wastes the upload rather than after. */
export const MAX_VEHICLE_PHOTO_BYTES = 5 * 1024 * 1024;

export function describeVehiclePhotoLimit() {
  return `${Math.round(MAX_VEHICLE_PHOTO_BYTES / (1024 * 1024))} MB`;
}

/** Rejects what the bucket would reject anyway, but in words and before the
 *  upload, so the form can say so next to the field. */
export function validateVehiclePhoto(file) {
  if (!file) return 'Choose an image of your vehicle.';
  if (!file.type?.startsWith('image/')) return 'That file is not an image. Choose a photo.';
  if (file.size > MAX_VEHICLE_PHOTO_BYTES) {
    return `That photo is larger than ${describeVehiclePhotoLimit()}. Choose a smaller one.`;
  }
  return '';
}

/**
 * Uploads one photo and returns the pointer to store on the vehicle.
 *
 * <p>Called at submit time rather than at file-choose time: a form somebody
 * abandons half way should not leave a file behind in the bucket.
 *
 * @returns {{ bucket: string, path: string }}
 */
export async function uploadVehiclePhoto(file) {
  const problem = validateVehiclePhoto(file);
  if (problem) throw new Error(problem);

  const client = requireSupabaseClient();
  const ownerId = getActiveCurrentUser()?.userId;
  if (!ownerId) {
    throw new Error('Sign in before adding a vehicle photo.');
  }

  // Keyed by owner, because every storage policy on this bucket checks that
  // first path segment against the caller's auth uid.
  const path = `${ownerId}/vehicle-${Date.now()}-${randomSuffix()}.${fileExtension(file)}`;

  const { error } = await client.storage
    .from(VEHICLE_PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || 'Could not upload the vehicle photo to Supabase Storage.');
  }

  return { bucket: VEHICLE_PHOTO_BUCKET, path };
}

/**
 * A URL the browser can render for a stored photo, or null when the vehicle
 * has none.
 *
 * <p>Resolves to null rather than throwing on failure. A photo that will not
 * load is a placeholder; it is not a reason for the vehicle page to show an
 * error over the car's whole history.
 */
export async function createVehiclePhotoSignedUrl(vehicle, expiresIn = 3600) {
  const path = vehicle?.photoPath;
  if (!path) return null;

  try {
    const client = requireSupabaseClient();
    const { data, error } = await client.storage
      .from(vehicle.photoBucket || VEHICLE_PHOTO_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Deletes a stored photo. Used to clean up after a failed save — the file is
 * uploaded before the vehicle is created, so a failure there would otherwise
 * leave a file nothing points at.
 */
export async function removeVehiclePhoto(pointer) {
  if (!pointer?.path) return;
  try {
    const client = requireSupabaseClient();
    await client.storage.from(pointer.bucket || VEHICLE_PHOTO_BUCKET).remove([pointer.path]);
  } catch {
    // Best effort. An orphaned file is litter, not a failure worth surfacing.
  }
}

function fileExtension(file) {
  const fromName = file.name?.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromType = file.type?.split('/').pop();
  return (fromType || 'jpg').toLowerCase();
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}
