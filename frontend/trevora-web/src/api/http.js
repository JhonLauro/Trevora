import { getCurrentUserHeaders } from './currentUser.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';

export async function apiRequest(path, options = {}) {
  const currentUserHeaders = options.skipAuthHeaders ? {} : getCurrentUserHeaders();
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
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function withoutHelperOptions(options) {
  const { headers, skipAuthHeaders, ...fetchOptions } = options;
  return fetchOptions;
}
