import { getActiveCurrentUser, setLoggedInUser } from './currentUser.js';
import { requireSupabaseClient } from './supabaseClient.js';
import { stripImageMetadata } from '../utils/stripImageMetadata.js';

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
 *
 * The bucket is private (migration 026). What the metadata holds is still the
 * URL `getPublicUrl` builds, kept purely as a pointer: every account that
 * already had a photo holds one, so keeping the format meant nothing had to be
 * migrated. It is never rendered directly -- `useAvatarSrc` swaps it for a
 * signed link first.
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

  // This bucket is public-read, so a GPS tag left in the file would be readable
  // by anyone holding the URL. The picture itself is not touched.
  const cleaned = await stripImageMetadata(file);

  const { error: uploadError } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, cleaned, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Could not upload your photo to Supabase Storage.');
  }

  // The pointer stored on the account, not a link anyone can open -- see the
  // note at the top of this file.
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

/** Signed links last an hour, like vehicle photos, and are reused until they
 *  are 45 minutes old, so a screen that re-checks every few minutes always
 *  holds one with time to spare. */
const AVATAR_LINK_SECONDS = 3600;
const AVATAR_LINK_REUSE_MS = 45 * 60 * 1000;
const signedAvatarLinks = new Map();
const pendingAvatarLinks = new Map();

/**
 * The src to draw for an account's photo, without waiting: the photo itself
 * when it is not one of ours (Google's, or a leftover data URL), a signed link
 * already in hand, or '' while one still has to be fetched.
 */
export function cachedAvatarSrc(avatar) {
  if (!avatar) return '';
  const path = storagePathFromPublicUrl(avatar);
  if (!path) return avatar;
  const link = signedAvatarLinks.get(path);
  return link && Date.now() - link.signedAt < AVATAR_LINK_REUSE_MS ? link.url : '';
}

/**
 * The src to draw for an account's photo.
 *
 * <p>Never throws. When a link cannot be signed -- offline, a lapsed session,
 * migration 026 not applied yet -- it keeps a previous link that has not
 * expired, and otherwise resolves to the stored URL. That URL still loads while
 * the bucket is public; once it is private it fails into the initials every
 * avatar already falls back to.
 */
export async function resolveAvatarSrc(avatar) {
  const cached = cachedAvatarSrc(avatar);
  if (cached || !avatar) return cached;

  const path = storagePathFromPublicUrl(avatar);
  if (!pendingAvatarLinks.has(path)) {
    // Shared, so the sidebar and the settings page mounting together sign once.
    pendingAvatarLinks.set(path, signAvatarPath(path).finally(() => pendingAvatarLinks.delete(path)));
  }
  const url = await pendingAvatarLinks.get(path);
  if (url) return url;

  const previous = signedAvatarLinks.get(path);
  const stillValid = previous && Date.now() - previous.signedAt < (AVATAR_LINK_SECONDS - 60) * 1000;
  return stillValid ? previous.url : avatar;
}

async function signAvatarPath(path) {
  try {
    const { data, error } = await requireSupabaseClient()
      .storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, AVATAR_LINK_SECONDS);
    if (error || !data?.signedUrl) return null;
    signedAvatarLinks.set(path, { url: data.signedUrl, signedAt: Date.now() });
    return data.signedUrl;
  } catch {
    return null;
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
