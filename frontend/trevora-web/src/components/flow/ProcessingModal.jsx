import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

/**
 * The modal the flow puts up while a step of it is running.
 *
 * <p>It was written for the receipt read and lived inside that page; the voice
 * note lands on the same review screen after the same kind of wait, so it is
 * shared rather than copied. The styles are `.flow-reading*` in
 * service-flow.css and were always shell rules — nothing in them was ever
 * about receipts.
 *
 * <p>The rule this component exists to enforce is that **every number on it is
 * one that actually happened**. This screen previously walked four invented
 * steps on a 900ms timer, announcing "Analyzing service details" whether or not
 * anything had returned. So a step either shows a real fraction, or it shows
 * an indeterminate bar and the seconds it has genuinely been waiting. There is
 * no third option, and specifically there is no percentage for work whose
 * length nobody knows.
 */
export default function ProcessingModal({ title, sub, foot, children }) {
  return (
    <div className="flow-reading">
      <div className="flow-reading__inner" role="status" aria-live="polite" aria-busy="true">
        <div>
          <h2 className="flow-reading__title">{title}</h2>
          {sub && <p className="flow-reading__sub">{sub}</p>}
        </div>

        <div className="flow-reading__steps">{children}</div>

        {foot && <p className="flow-reading__foot">{foot}</p>}
      </div>
    </div>
  );
}

/**
 * One line of the modal.
 *
 * @param state 'pending' | 'active' | 'done' — dims the row and fills the dot.
 * @param progress a 0–100 number for work that can be counted, the string
 *     'waiting' for work that cannot, or nothing for a row with no bar.
 */
export function ProcessingStep({ name, count, state = 'pending', progress = null }) {
  const modifier = state === 'pending' ? '' : ` is-${state}`;

  return (
    <div className={`flow-reading__step${modifier}`}>
      <span className={`flow-reading__dot${modifier}`} aria-hidden="true">
        <Check size={13} strokeWidth={3} />
      </span>
      <div style={{ flex: 1 }}>
        <p className="flow-reading__name">{name}</p>
        {count && <p className="flow-reading__count">{count}</p>}
        {progress === 'waiting' && (
          <div className="flow-reading__bar flow-reading__bar--waiting"><i /></div>
        )}
        {typeof progress === 'number' && (
          <div className="flow-reading__bar"><i style={{ width: `${progress}%` }} /></div>
        )}
      </div>
    </div>
  );
}

/** Seconds since `running` became true, or 0 while it is false. */
export function useElapsedSeconds(running) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) {
      setSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running]);

  return seconds;
}

/** "14s so far", "1m 06s so far" — the honest half of an indeterminate step. */
export function formatWait(seconds) {
  if (seconds < 60) return `${seconds}s so far`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s so far`;
}
