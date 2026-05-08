export const friendlyErrorMessage = (
  error,
  fallback = 'Request failed. Please try again.'
) => {
  const status = error?.status;
  const rawMessage = String(error?.message || '').trim();
  const message = rawMessage.toLowerCase();

  if (rawMessage === 'Failed to fetch' || message.includes('networkerror')) {
    return 'Network error. Please check your connection.';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'Request timed out. Please try again.';
  }

  if (
    message.includes('bad credentials') ||
    message.includes('invalid credentials') ||
    message.includes('identifier or password') ||
    message.includes('check your credentials')
  ) {
    return 'Invalid credentials.';
  }

  if (message.includes('jwt') || message.includes('token') || message.includes('session')) {
    return 'Session expired. Please sign in again.';
  }

  if (status === 400) return fallback;
  if (status === 401) return 'Session expired. Please sign in again.';
  if (status === 403) return 'Access denied. You do not have permission to perform this action.';
  if (status === 404) return 'Not found. The requested resource could not be found.';
  if (status === 409) return 'Conflict. This information already exists.';
  if (status === 422) return 'Validation failed. Please review your input.';
  if (status === 429) return 'Too many requests. Please try again later.';
  if (status >= 500) return 'Service unavailable. Please try again later.';

  if (message.includes('email') && (message.includes('exists') || message.includes('already'))) {
    return 'Email already exists.';
  }

  if (message.includes('duplicate') || message.includes('constraint')) {
    return 'Duplicate entry. Please review your input.';
  }

  if (
    message.includes('exception') ||
    message.includes('trace') ||
    message.includes('sql') ||
    message.includes('hibernate') ||
    message.includes('null') ||
    rawMessage.startsWith('{')
  ) {
    return fallback;
  }

  return rawMessage || fallback;
};
