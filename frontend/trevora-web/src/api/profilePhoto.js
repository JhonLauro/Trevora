import { getActiveCurrentUser, setLoggedInUser } from './currentUser.js';
import { requireSupabaseClient } from './supabaseClient.js';

/**
 * Profile photos, stored the same way receipts are: the file goes to Supabase
 * Storage under the owner's own user id, and only a pointer to it travels
 * anywhere else.
 *
 * The pointer lives in Supabase Auth `user_metadata`, next to the name and
 * role already kept there — not in the backend `users` table. That choice is
 * what makes the photo follow the account rather than the browser: the
 * previous implementation read the file with FileReader and kept the base64
 * string in localStorage, so a photo set on a laptop was invisible on a phone,
 * and a couple of megapixels of data URL sat in a 5 MB store shared with every
 * other preference until it overflowed.
 */
export const AVATAR_BUCKET = import.meta.env.VITE_SUPABASE_AVATAR_BUCKET ?? 'profile-photos';

/**
 * Our own key, not `avatar_url`.
 *
 * `avatar_url` belongs to the OAuth provider. Supabase refreshes
 * `user_metadata` from Google's identity data on every Google sign-in, so a
 * photo written there survived until the next sign-in and was then silently
 * replaced by the Google picture — the user's chosen photo reverting on its
 * own, with nothing in the app having touched it.
 *
 * Google never writes this key, so what the user uploaded stays uploaded.
 */
export const AVATAR_METADATA_KEY = 'trevora_avatar_url';

/** Generous for a 64px circle, small enough that a phone photo gets rejected
 *  before it wastes the upload rather than after. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function describeAvatarLimit() {
  return `${Math.round(MAX_AVATAR_BYTES / (1024 * 1024))} MB`;
}

/**
 * Uploads the chosen file, points the account at it, and refreshes the stored
 * user so every avatar on screen updates at once.
 *
 * @returns the public URL of the stored photo
 */
export async function uploadProfilePhoto(file) {
  if (!file) throw new Error('Choose an image file for your profile photo.');
  if (!file.type?.startsWith('image/')) {
    throw new Error('Choose an image file for your profile photo.');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(`That image is larger than ${describeAvatarLimit()}. Choose a smaller one.`);
  }

  const client = requireSupabaseClient();
  const currentUser = getActiveCurrentUser();
  if (!currentUser?.userId) {
    throw new Error('Sign in before changing your profile photo.');
  }

  // The old photo is removed only after the new one is safely stored, so a
  // failed upload leaves the account with the picture it already had.
  const previousUrl = currentUser.avatar || '';
  const path = `${currentUser.userId}/avatar-${Date.now()}.${fileExtension(file)}`;

  const { error: uploadError } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Could not upload your photo to Supabase Storage.');
  }

  const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) {
    await removeStoredAvatar(client, path);
    throw new Error('Supabase Storage did not return a URL for the uploaded photo.');
  }

  const { error: metadataError } = await client.auth.updateUser({
    data: { [AVATAR_METADATA_KEY]: publicUrl },
  });
  if (metadataError) {
    // Nothing points at the new file, so leaving it would be litter.
    await removeStoredAvatar(client, path);
    throw new Error(metadataError.message || 'Could not save your profile photo.');
  }

  // Dispatches the auth-changed event AppShell listens on, so the sidebar
  // swaps initials for the photo without a reload.
  setLoggedInUser({ ...currentUser, avatar: publicUrl });

  const previousPath = storagePathFromPublicUrl(previousUrl);
  if (previousPath && previousPath !== path) {
    await removeStoredAvatar(client, previousPath);
  }

  return publicUrl;
}

/**
 * Best effort by design: a photo that cannot be deleted is an orphaned file,
 * not a failed save, and reporting it as an error would be a lie about what
 * the user just did.
 */
async function removeStoredAvatar(client, path) {
  try {
    await client.storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    // ignored -- see above
  }
}

/**
 * Public storage URLs look like
 * `<project>/storage/v1/object/public/<bucket>/<path>`. Anything that is not
 * one of ours (a Google photo URL, say) returns null and is left alone.
 */
function storagePathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

function fileExtension(file) {
  const fromName = String(file.name || '').split('.').pop();
  if (fromName && /^[a-z0-9]{1,5}$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = String(file.type || '').split('/').pop();
  return /^[a-z0-9]{1,5}$/i.test(fromType) ? fromType.toLowerCase() : 'jpg';
}
