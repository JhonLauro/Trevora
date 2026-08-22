import React from 'react';

export default function InkLockup({ tone = 'light' }) {
  return (
    <span className={`ink-lockup ink-lockup--${tone === 'light' ? 'light' : 'dark'}`} aria-label="Trevora">
      <svg className="ink-lockup__mark" viewBox="0 0 48 48" role="img" aria-hidden="true" fill="currentColor">
        <path d="M9.5 13.5c1.1-2.2 3.3-3.5 5.7-3.5h17.5l-2.9 6.1c-.6 1.2-1.8 1.9-3.1 1.9h-9.6v16.6H8.7V22.9H5.4l2-4h9.7v-5.4H9.5Z" />
        <path d="M7.3 25.4h9.8v7.9C11.7 34.7 7.8 37 5.4 41h7.4c1.6-2.2 3.7-4 6.2-5.1V22.6H10c-1.2 0-2.2.6-2.7 1.6Z" />
        <path d="M20.7 41c1.3-4.8 5-8.6 9.9-10.4v-4.4c-7 2-12.3 7.5-14 14.8h4.1Z" />
        <path d="M32.9 20.7h6.5v2.1h-6.5zM32.9 26.2h5.3v2.1h-5.3zM32.9 31.7h4.1v2.1h-4.1z" />
        <rect x="40.1" y="19.7" width="4.8" height="4.8" rx="1.2" />
        <rect x="38.9" y="25.2" width="4.8" height="4.8" rx="1.2" />
        <rect x="37.7" y="30.7" width="4.8" height="4.8" rx="1.2" />
      </svg>
      <span className="ink-lockup__wordmark">Trevora</span>
    </span>
  );
}
