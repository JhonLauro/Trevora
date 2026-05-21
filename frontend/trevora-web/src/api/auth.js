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
    const verificationError = new Error('Account created. Check your email to verify your account, then sign in.');
    verificationError.code = 'EMAIL_VERIFICATION_REQUIRED';
    throw verificationError;
  }

  const user = await syncSupabaseProfile(payload, data.session.access_token);
  setLoggedInUser(user, data.session);
  return user;
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

  const metadata = data.user?.user_metadata ?? {};
  const profile = {
    firstName: metadata.first_name || metadata.firstName || metadata.full_name?.split(' ')?.[0] || 'User',
    lastName: metadata.last_name || metadata.lastName || '',
    role: normalizeRole(metadata.role),
  };
  const user = await syncSupabaseProfile(profile, data.session.access_token);
  setLoggedInUser(user, data.session);
  return user;
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

function normalizeSupabaseAuthError(error) {
  const message = String(error?.message || 'Authentication request failed.');
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('email rate limit')) {
    return new Error('Too many verification emails were requested. Please wait a few minutes before trying again.');
  }

  if (normalizedMessage.includes('already registered') || normalizedMessage.includes('already exists')) {
    return new Error('An account with this email already exists. Please sign in instead.');
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
