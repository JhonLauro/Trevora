import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * The frame every screen in the add-a-record flow wears.
 *
 * <p>It is an ordinary Ink page — `.ink-page` inside `AppShell`, with the
 * sidebar where it always is. The Claude Design artboards draw this flow with
 * its own dark bar and no navigation, but that is a canvas convention for
 * showing one screen in isolation, not an instruction to replace the app's
 * chrome. Taking it literally put a second dark bar directly against the
 * already-dark 264px sidebar and covered the nav with a fixed overlay.
 *
 * <p>What the artboards were actually right about is the **progress**: six
 * segments spanning all six screens. The old indicator ran across three of six,
 * and the three it hid were review, confirm and saved — the ones where the
 * owner does the actual checking. A progress device that stops before the work
 * is a progress device that lies.
 *
 * <p>"Save and finish later" is a real exit rather than decoration: the draft
 * is already persisted server-side by the time any of these screens render, so
 * leaving loses nothing except unsaved edits on step 4, which prompt first.
 */

const STEPS = ['Vehicle', 'How to add it', 'The details', 'Check', 'Confirm', 'Saved'];

export default function FlowChrome({
  step,
  vehicleName,
  title,
  subtitle,
  onExit,
  onSaveLater,
  width = 'default',
  band = null,
  children,
}) {
  const navigate = useNavigate();
  const contentClass = {
    default: 'flow-content',
    wide: 'flow-content flow-content--wide',
    mid: 'flow-content flow-content--mid',
    narrow: 'flow-content flow-content--narrow',
  }[width] ?? 'flow-content';

  function handleExit() {
    if (onExit) onExit();
    else navigate('/');
  }

  return (
    <div className="ink-page flow">
      <div className="flow-progress">
        <ol className="flow-progress__track" aria-label={`Step ${step} of 6`}>
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={`flow-progress__seg${index < step ? ' is-done' : ''}`}
              aria-hidden="true"
            />
          ))}
        </ol>
        <ol className="flow-progress__labels">
          {STEPS.map((label, index) => (
            <li key={label} className={index + 1 === step ? 'is-current' : ''}>
              {label}
            </li>
          ))}
        </ol>
        <p className="flow-progress__compact">
          Step {step} of 6 — {STEPS[step - 1]}
        </p>
      </div>

      <header className="ink-page__header">
        <div>
          <p className="flow-eyebrow">
            Add a service record{vehicleName ? ` · ${vehicleName}` : ''}
          </p>
          {title && <h1 className="ink-page__title">{title}</h1>}
          {subtitle && <p className="ink-page__summary">{subtitle}</p>}
        </div>
        <div className="flow-header__actions">
          {onSaveLater && (
            <button className="flow-link" type="button" onClick={onSaveLater}>
              Save and finish later
            </button>
          )}
          <button className="flow-btn flow-btn--ghost flow-btn--sm" type="button" onClick={handleExit}>
            Leave
          </button>
        </div>
      </header>

      {band}

      <div className={contentClass}>{children}</div>
    </div>
  );
}
