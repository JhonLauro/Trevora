import React from 'react';
import './Snackbar.css';

const Snackbar = ({ open, message, type = 'error', onClose }) => {
  React.useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => onClose?.(), 4500);
    return () => window.clearTimeout(timer);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`snackbar snackbar--${type}`} role="status">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Close notification">
        x
      </button>
    </div>
  );
};

export default Snackbar;
