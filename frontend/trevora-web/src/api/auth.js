import { apiRequest } from './http.js';
import { setLoggedInUser } from './currentUser.js';

export async function registerUser(payload) {
  const user = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuthHeaders: true,
  });
  setLoggedInUser(user);
  return user;
}

export async function loginUser(payload) {
  const user = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuthHeaders: true,
  });
  setLoggedInUser(user);
  return user;
}

export function getCurrentUser() {
  return apiRequest('/auth/me');
}
