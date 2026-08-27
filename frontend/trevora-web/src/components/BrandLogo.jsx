import React from 'react';
import TrevoraMark from './TrevoraMark.jsx';

export default function BrandLogo({ variant = 'color', className = '' }) {
  return (
    <span className={`trevora-logo trevora-logo--${variant} ${className}`.trim()} aria-label="Trevora">
      <TrevoraMark className="trevora-logo__mark" />
      <span className="trevora-logo__wordmark">Trevora</span>
    </span>
  );
}
