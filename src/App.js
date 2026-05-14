import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import LandingPage from './pages/landing/LandingPage';

const PAGE_TITLES = [
  { pattern: /^\/$/, title: 'Home' },
  { pattern: /^\/login$/, title: 'Sign In' },
  { pattern: /^\/register$/, title: 'Create Account' },
];

const BrowserTitle = () => {
  const { pathname } = useLocation();

  React.useEffect(() => {
    const match = PAGE_TITLES.find((page) => page.pattern.test(pathname));
    document.title = match ? `Trevora | ${match.title}` : 'Trevora';
  }, [pathname]);

  return null;
};

function App() {
  return (
    <BrowserRouter>
      <BrowserTitle />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
