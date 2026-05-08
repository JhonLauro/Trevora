import { requestApi } from './apiClient';

export const loginUser = async (identifier, password) => {
  return requestApi(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    },
    'Login failed. Please check your credentials.',
    false
  );
};

export const registerUser = async (userData) => {
  return requestApi(
    '/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    },
    'Registration failed. Please try again.',
    false
  );
};

export const logoutUser = () => {
  localStorage.removeItem('trevora_token');
  localStorage.removeItem('trevora_user');
};
