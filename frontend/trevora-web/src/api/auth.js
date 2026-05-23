import { apiRequest } from './http.js';
import { setLoggedInUser } from './currentUser.js';
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

  if (!data.session) {
    return {
      requiresVerification: true,
      otpType: 'signup',
      message: 'A verification code has been sent to your email.',
    };
  }

  await client.auth.signOut();
  await requestRegistrationEmailCode(client, payload.email);
  return {
    requiresVerification: true,
    otpType: 'email',
    message: 'A verification code has been sent to your email.',
  };
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
  setLoggedInUser(user, data.session, { remember: payload.remember });
  return user;
}

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
  setLoggedInUser(user, data.session);
  return user;
}

async function requestRegistrationEmailCode(client, email) {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    throw normalizeSupabaseAuthError(error);
  }
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
  const fallbackNameParts = fullName.trim().split(/\s+/, 2);
  return {
    firstName: metadata.first_name || metadata.firstName || fallbackNameParts[0] || 'User',
    lastName: metadata.last_name || metadata.lastName || fallbackNameParts[1] || 'Account',
    role: normalizeRole(metadata.role),
  };
}

function normalizeSupabaseAuthError(error) {
  const message = String(error?.message || 'Authentication request failed.');
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('email rate limit')) {
    return new Error('Too many verification emails were requested. Please wait a few minutes before trying again.');
  }

  if (normalizedMessage.includes('already registered') || normalizedMessage.includes('already exists')) {
    return new Error('An account with this email already exists. Please sign in instead.');
  }

  if (normalizedMessage.includes('otp') && normalizedMessage.includes('expired')) {
    return new Error('That code has expired. Request a new code and try again.');
  }

  if (normalizedMessage.includes('token') && normalizedMessage.includes('invalid')) {
    return new Error('That code is invalid. Check the email code and try again.');
  }

  return new Error(message);
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
