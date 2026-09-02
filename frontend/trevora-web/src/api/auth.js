import { apiRequest } from './http.js';
import { clearLoggedInUser, setLoggedInUser } from './currentUser.js';
import { AVATAR_METADATA_KEY } from './profilePhoto.js';
import { requireSupabaseClient } from './supabaseClient.js';

export async function registerUser(payload) {
  const client = requireSupabaseClient();
  const fullName = `${payload.firstName} ${payload.lastName}`.trim();
  const { data, error } = await client.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: {
        first_name: payload.firstName,
        last_name: payload.lastName,
        full_name: fullName,
        name: fullName,
        role: payload.role,
      },
    },
  });

  if (error) {
    throw normalizeSupabaseAuthError(error);
  }

  // Signup used to sign the new account straight back out and post an OTP,
  // so every owner had to re-key a six-digit code before seeing anything.
  // That step is gone: when Supabase hands back a session, we use it.
  //
  // Whether it does is a project setting, not ours — with "Confirm email" on,
  // `signUp` returns no session and the address genuinely has to be confirmed
  // before the account can sign in. That case is reported honestly rather than
  // worked around, because there is no client-side way around it.
  if (!data.session) {
    return {
      requiresVerification: true,
      message:
        'Check your email and click the confirmation link to finish setting up your account, then sign in.',
    };
  }

  const supabaseProfile = profileFromSupabaseUser(data.user);
  const profile = {
    firstName: payload.firstName || supabaseProfile.firstName,
    lastName: payload.lastName || supabaseProfile.lastName,
    role: payload.role || supabaseProfile.role,
  };
  const user = await syncSupabaseProfile(profile, data.session.access_token);
  setLoggedInUser(withAvatar(user, profile), data.session);
  return { requiresVerification: false, user };
}

export async function loginUser(payload) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });

  if (error) {
    throw normalizeSupabaseAuthError(error);
  }

  const profile = profileFromSupabaseUser(data.user);
  const user = await syncSupabaseProfile(profile, data.session.access_token);
  setLoggedInUser(withAvatar(user, profile), data.session, { remember: payload.remember });
  return user;
}

export async function signInWithGoogle() {
  const client = requireSupabaseClient();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw normalizeSupabaseAuthError(error);
  }
}

export async function completeOAuthSignIn() {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw normalizeSupabaseAuthError(error);
  }

  const session = data.session;
  if (!session) {
    throw new Error('Sign-in did not complete. Please try again.');
  }

  const profile = profileFromSupabaseUser(session.user);
  const user = await syncSupabaseProfile(profile, session.access_token);
  setLoggedInUser(withAvatar(user, profile), session);
  return user;
}

/**
 * Parked, not deleted. Nothing calls this while signup goes straight through
 * (see `registerUser`), but the OTP step is coming back — keeping the working
 * verify here is cheaper than rewriting it against `verifyOtp`'s type/session
 * handling a second time.
 */
export async function verifyRegistrationOtp(payload) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.verifyOtp({
    email: payload.email,
    token: payload.token,
    type: payload.otpType || 'signup',
  });

  if (error) {
    throw normalizeSupabaseAuthError(error);
  }

  if (!data.session) {
    throw new Error('Account verification did not return a session. Request a new code and try again.');
  }

  const supabaseProfile = profileFromSupabaseUser(data.user);
  const profile = {
    firstName: payload.firstName || supabaseProfile.firstName,
    lastName: payload.lastName || supabaseProfile.lastName,
    role: payload.role || supabaseProfile.role,
  };
  const user = await syncSupabaseProfile(profile, data.session.access_token);
  setLoggedInUser(withAvatar(user, profile), data.session);
  return user;
}

/**
 * `/auth/sync` answers with the backend's own view of the user, which has no
 * photo in it -- the pointer lives in Supabase Auth metadata. Without this the
 * avatar would be dropped on every sign-in and reappear only after a save.
 */
function withAvatar(user, profile) {
  return profile?.avatar ? { ...user, avatar: profile.avatar } : user;
}

async function syncSupabaseProfile(payload, accessToken) {
  try {
    return await apiRequest('/auth/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        firstName: payload.firstName,
        lastName: payload.lastName,
        role: payload.role,
      }),
      skipAuthHeaders: true,
    });
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('users_email_key') || message.toLowerCase().includes('duplicate key')) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }
    throw error;
  }
}

function normalizeRole(role) {
  const value = String(role || 'VEHICLE_OWNER').toUpperCase();
  if (value === 'OWNER') {
    return 'VEHICLE_OWNER';
  }
  if (['VEHICLE_OWNER', 'ADMIN'].includes(value)) {
    return value;
  }
  return 'VEHICLE_OWNER';
}

function profileFromSupabaseUser(user) {
  const metadata = user?.user_metadata ?? {};
  const fullName = metadata.full_name || metadata.fullName || metadata.name || '';
  // Providers like Google hand back one name string. Take the first token as
  // the given name and keep ALL remaining tokens as the family name —
  // split(/\s+/, 2) would drop the tail of a compound surname
  // ("Maria Dela Cruz" -> "Maria" / "Dela", losing "Cruz").
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
  const [fallbackFirst, ...fallbackRest] = nameParts;
  return {
    firstName: metadata.first_name || metadata.firstName || fallbackFirst || 'User',
    lastName: metadata.last_name || metadata.lastName || fallbackRest.join(' ') || 'Account',
    role: normalizeRole(metadata.role),
    /* Order matters, and this is the whole fix for a photo that reverted on
       its own: a photo the user uploaded here outranks whatever the provider
       supplied. `avatar_url` and `picture` are Google's, rewritten from its
       identity data on every OAuth sign-in, so a Google account still arrives
       with its photo already in place — it just cannot overwrite a choice.

       `avatar_url` is read second rather than dropped because photos uploaded
       before this split still live there. */
    avatar: metadata[AVATAR_METADATA_KEY]
      || metadata.avatar_url
      || metadata.avatarUrl
      || metadata.picture
      || '',
  };
}

function normalizeSupabaseAuthError(error) {
  const message = String(error?.message || 'Authentication request failed.');
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('email rate limit')) {
    return new Error('Too many verification emails were requested. Please wait a few minutes before trying again.');
  }

  if (normalizedMessage.includes('already registered') || normalizedMessage.includes('already exists')) {
    // "Sign in instead" is only half the instruction when the existing account
    // came from Google: that owner has no password, so following the advice
    // literally lands them back here. Name both routes.
    return new Error(
      'An account with this email already exists. Sign in instead — and if you '
      + 'signed up with Google, use "Continue with Google" rather than a password.',
    );
  }

  if (normalizedMessage.includes('otp') && normalizedMessage.includes('expired')) {
    return new Error('That code has expired. Request a new code and try again.');
  }

  if (normalizedMessage.includes('token') && normalizedMessage.includes('invalid')) {
    return new Error('That code is invalid. Check the email code and try again.');
  }

  return new Error(message);
}

const RECOVERY_LINK_EXPIRED =
  'This reset link has expired. Request a new one and use the most recent email.';

/**
 * Step 1 of reset: email the user a recovery link. Always resolves without
 * revealing whether the address has an account — telling an anonymous caller
 * which emails are registered is an account-enumeration leak.
 */
export async function requestPasswordReset(email) {
  const client = requireSupabaseClient();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });

  if (error) {
    throw normalizeSupabaseAuthError(error);
  }
}

/**
 * Step 2 of reset: turn the link the user clicked into a recovery session.
 * Handles both PKCE (`?code=`) and implicit (`#access_token=`) flows, since
 * which one arrives depends on the Supabase project's configuration.
 */
export async function beginPasswordRecovery() {
  const client = requireSupabaseClient();

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (hashParams.get('error_description') || hashParams.get('error')) {
    throw new Error(RECOVERY_LINK_EXPIRED);
  }

  const code = new URL(window.location.href).searchParams.get('code');
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error(RECOVERY_LINK_EXPIRED);
    }
    return true;
  }

  const { data } = await client.auth.getSession();
  if (data.session) {
    return true;
  }

  // Implicit flow: the client parses the URL hash shortly after load, so the
  // session may not exist yet on first paint.
  return waitForRecoverySession(client);
}

function waitForRecoverySession(client, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (session) {
        finish(true);
      }
    });
  });
}

/**
 * Step 3 of reset: set the new password, then sign out. The recovery session
 * never went through `loginUser`, so the app's local profile state was never
 * populated — leaving it active would strand the user half-authenticated.
 * Sending them to sign in with the new password is the clean exit.
 */
export async function completePasswordReset(newPassword) {
  const client = requireSupabaseClient();
  const { error } = await client.auth.updateUser({ password: newPassword });

  if (error) {
    throw normalizeSupabaseAuthError(error);
  }

  await client.auth.signOut();
  clearLoggedInUser();
}

export function getCurrentUser() {
  return apiRequest('/auth/me');
}

export function syncCurrentUserProfile(payload) {
  return apiRequest('/auth/sync', {
    method: 'POST',
    body: JSON.stringify({
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: payload.role ?? 'VEHICLE_OWNER',
    }),
  });
}

/**
 * Permanently deletes the signed-in owner's account.
 *
 * The server removes the Supabase auth user, which cascades to the profile,
 * vehicles, drafts, confirmed records, share links and mechanic sessions, and
 * then clears the receipt images from storage. There is no undo.
 *
 * The local session is cleared here rather than left to expire: the access
 * token still looks valid to the browser for a few more minutes even though
 * the account behind it no longer exists, and a signed-in-looking app whose
 * every request 401s is a worse experience than being signed out.
 */
export async function deleteAccount() {
  const result = await apiRequest('/auth/account', { method: 'DELETE' });

  try {
    await requireSupabaseClient().auth.signOut();
  } catch {
    // The account is already gone; a failed sign-out must not look like a
    // failed deletion.
  }
  clearLoggedInUser();

  return result;
}
