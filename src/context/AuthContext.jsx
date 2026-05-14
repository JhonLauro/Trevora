import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { loginUser, logoutUser, registerUser } from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('trevora_token');
      const storedUser = localStorage.getItem('trevora_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      localStorage.removeItem('trevora_token');
      localStorage.removeItem('trevora_user');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener('trevora:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('trevora:unauthorized', handleUnauthorized);
  }, []);

  const persistSession = (tokenValue, userValue) => {
    localStorage.setItem('trevora_token', tokenValue);
    localStorage.setItem('trevora_user', JSON.stringify(userValue));
    setToken(tokenValue);
    setUser(userValue);
  };

  const login = useCallback(async (identifier, password) => {
    if (identifier === 'owner@trevora.app' && password) {
      const demoUser = {
        id: 'demo-owner',
        fullName: 'Juan dela Cruz',
        email: 'owner@trevora.app',
        role: 'owner',
      };
      persistSession('demo-owner-session', demoUser);
      return { token: 'demo-owner-session', user: demoUser };
    }

    const data = await loginUser(identifier, password);
    persistSession(data.token, data.user);
    return data;
  }, []);

  const register = useCallback(async (userData) => {
    const data = await registerUser(userData);
    persistSession(data.token, data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    logoutUser();
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: !!token,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
