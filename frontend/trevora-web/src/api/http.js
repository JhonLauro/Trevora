import { clearLoggedInUser, getLoggedInUser, setLoggedInUser } from './currentUser.js';
import { supabase } from './supabaseClient.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';

export async function apiRequest(path, options = {}) {
  const currentUserHeaders = options.skipAuthHeaders ? {} : await getCurrentUserHeaders();
  if (!options.skipAuthHeaders && !currentUserHeaders.Authorization) {
    throw new Error('Please sign in to continue.');
  }

  const headers = options.body instanceof FormData
    ? { ...currentUserHeaders, ...options.headers }
    : {
        'Content-Type': 'application/json',
        ...currentUserHeaders,
        ...options.headers,
      };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers,
      ...withoutHelperOptions(options),
    });
  } catch {
    throw new Error(`Could not reach the Trevora API at ${API_BASE_URL}. Restart the backend and make sure this frontend port is allowed.`);
  }

  if (!response.ok) {
    let message = 'Request failed.';
    try {
      const body = await response.json();
      message = body.message ?? body.error ?? message;
    } catch {
      message = response.statusText || message;
    }
    if (!options.skipAuthHeaders && isExpiredSessionMessage(message)) {
      clearLoggedInUser();
      window.location.assign('/login');
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function getCurrentUserHeaders() {
  const user = getLoggedInUser();
  if (!user) {
    return {};
  }

  let accessToken = user.accessToken;

  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const refreshedToken = data.session?.access_token;
      if (refreshedToken && refreshedToken !== accessToken) {
        accessToken = refreshedToken;
        setLoggedInUser({ ...user, accessToken }, data.session);
      }
    } catch {
      // Fall back to the stored token; the backend will reject it if it is no longer usable.
    }
  }

  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

function isExpiredSessionMessage(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('supabase session is invalid or expired')
    || normalized.includes('valid supabase session is required')
    || normalized.includes('sign in is required');
}

function withoutHelperOptions(options) {
  const { headers, skipAuthHeaders, ...fetchOptions } = options;
  return fetchOptions;
}
