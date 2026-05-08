import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import reportWebVitals from './reportWebVitals';

const savedTheme = localStorage.getItem('trevora-theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = savedTheme;
document.documentElement.style.colorScheme = savedTheme;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

reportWebVitals();
