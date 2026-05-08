import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import LandingPage from './pages/landing/LandingPage';
import LoadingScreen from './components/LoadingScreen';

const PAGE_TITLES = [
  { pattern: /^\/$/, title: 'Home' },
  { pattern: /^\/login$/, title: 'Sign In' },
  { pattern: /^\/register$/, title: 'Create Account' },
  { pattern: /^\/dashboard$/, title: 'Dashboard' },
];

const BrowserTitle = () => {
  const { pathname } = useLocation();

  React.useEffect(() => {
    const match = PAGE_TITLES.find((page) => page.pattern.test(pathname));
    document.title = match ? `Trevora | ${match.title}` : 'Trevora';
  }, [pathname]);

  return null;
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <BrowserTitle />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
