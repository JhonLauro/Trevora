import { clearLoggedInUser, getLoggedInUser, setLoggedInUser } from './currentUser.js';
import { supabase } from './supabaseClient.js';

const SUSPENSION_NOTICE_KEY = 'trevora.suspension-notice';

/** The suspension reason left for the sign-in page by a refused request, read once. */
export function takeSuspensionNotice() {
  try {
    const message = window.sessionStorage.getItem(SUSPENSION_NOTICE_KEY) || '';
    window.sessionStorage.removeItem(SUSPENSION_NOTICE_KEY);
    return message;
  } catch {
    return '';
  }
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';

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
    let code = null;
    try {
      const body = await response.json();
      message = body.message ?? body.error ?? message;
      code = body.code ?? null;
    } catch {
      message = response.statusText || message;
    }
    if (!options.skipAuthHeaders && code === 'ACCOUNT_SUSPENDED') {
      // Signed out everywhere, with the reason waiting on the sign-in page.
      try {
        window.sessionStorage.setItem(SUSPENSION_NOTICE_KEY, message);
      } catch {
        // Blocked storage: the sign-in page opens without the reason.
      }
      if (supabase) supabase.auth.signOut().catch(() => {});
      clearLoggedInUser();
      window.location.assign('/login');
    } else if (!options.skipAuthHeaders && isExpiredSessionMessage(message)) {
      clearLoggedInUser();
      window.location.assign('/login');
    }
    // The status travels with the message so a page can tell a limit (429)
    // from a failure without matching on wording.
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    throw error;
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
