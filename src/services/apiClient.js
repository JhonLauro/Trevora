import { friendlyErrorMessage } from '../utils/friendlyErrors';

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || '/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const parseBody = async (response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const extractErrorMessage = (json, fallback) =>
  json?.error?.details ||
  json?.error?.detail ||
  json?.error?.message ||
  json?.message ||
  fallback;

const handleUnauthorized = () => {
  localStorage.removeItem('trevora_token');
  localStorage.removeItem('trevora_user');
  window.dispatchEvent(new Event('trevora:unauthorized'));

  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
};

export const requestApi = async (
  endpoint,
  options = {},
  fallbackError = 'Request failed.',
  requiresAuth = false
) => {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  } catch (error) {
    throw new ApiError(friendlyErrorMessage(error), 0, 'NETWORK_ERROR');
  }

  const json = await parseBody(response);

  if (!response.ok) {
    if (requiresAuth && (response.status === 401 || response.status === 403)) {
      handleUnauthorized();
    }

    const rawError = new ApiError(
      extractErrorMessage(json, fallbackError),
      response.status,
      json?.error?.code || null
    );
    throw new ApiError(
      friendlyErrorMessage(rawError, fallbackError),
      rawError.status,
      rawError.code
    );
  }

  return json?.data ?? null;
};
