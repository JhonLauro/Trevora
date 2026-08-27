import React from 'react';
import TrevoraMark from './TrevoraMark.jsx';

export default function InkLockup({ tone = 'light' }) {
  return (
    <span className={`ink-lockup ink-lockup--${tone === 'light' ? 'light' : 'dark'}`} aria-label="Trevora">
      <TrevoraMark className="ink-lockup__mark" />
      <span className="ink-lockup__wordmark">Trevora</span>
    </span>
  );
}
