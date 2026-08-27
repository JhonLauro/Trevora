import React from 'react';

/**
 * The Trevora mark: three plates offset in depth, the top one carrying the
 * lines. Records piling up, literally.
 *
 * The two rear plates are `currentColor` at reduced alpha, so the mark takes
 * its colour from whatever it sits in — one component for the green lockup,
 * the white-on-dark shell header and the favicon-sized nav mark alike.
 *
 * The front plate is a single evenodd path rather than a filled square with
 * white bars drawn over it: the lines are holes, so they read correctly on a
 * tinted card as well as on paper.
 */
export default function TrevoraMark({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      role="img"
      aria-hidden="true"
      fill="currentColor"
    >
      <rect x="4" y="17" width="21" height="21" rx="1.5" opacity="0.28" />
      <rect x="9.5" y="12.5" width="21" height="21" rx="1.5" opacity="0.55" />
      <path
        fillRule="evenodd"
        d="M15 8h23v23H15V8Zm4 5v3.4h15V13H19Zm0 5.3v3.4h10v-3.4H19Zm0 5.3V27h15v-3.4H19Z"
      />
    </svg>
  );
}
