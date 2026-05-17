import { getCurrentUserHeaders } from './currentUser.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';

export async function apiRequest(path, options = {}) {
  const currentUserHeaders = getCurrentUserHeaders();
  const headers = options.body instanceof FormData
    ? { ...currentUserHeaders, ...options.headers }
    : {
        'Content-Type': 'application/json',
        ...currentUserHeaders,
        ...options.headers,
      };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...options,
  });

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
