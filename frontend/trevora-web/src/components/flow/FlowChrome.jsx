import React from 'react';
import { useT } from '../../i18n/index.jsx';
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

/* Keys, resolved at render. A t() call out here would run at module load with
   nothing bound and take the whole flow down -- see RANGES in GaragePage. */
const STEP_KEYS = [
  'flow.step.vehicle', 'flow.step.howToAdd', 'flow.step.details',
  'flow.step.check', 'flow.step.confirm', 'flow.step.saved',
];

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
  const t = useT();
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
        <ol className="flow-progress__track" aria-label={t('flow.stepOf', { step })}>
          {STEP_KEYS.map((key, index) => (
            <li
              key={key}
              /* `is-latest` marks the segment this step just completed, so only
                 that one animates. Every page in this flow is its own route, so
                 the bar remounts on each step -- without this every filled
                 segment would re-sweep every time, which reads as loading
                 rather than as progress. */
              className={[
                'flow-progress__seg',
                index < step ? 'is-done' : '',
                index === step - 1 ? 'is-latest' : '',
              ].filter(Boolean).join(' ')}
              aria-hidden="true"
            />
          ))}
        </ol>
        <ol className="flow-progress__labels">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className={index + 1 === step ? 'is-current' : ''}>
              {t(key)}
            </li>
          ))}
        </ol>
        <p className="flow-progress__compact">
          {t('flow.stepOfNamed', { step, label: t(STEP_KEYS[step - 1]) })}
        </p>
      </div>

      <header className="ink-page__header">
        <div>
          <p className="flow-eyebrow">
            {t('flow.eyebrow')}{vehicleName ? ` · ${vehicleName}` : ''}
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
            {t('flow.leave')}
          </button>
        </div>
      </header>

      {band}

      {/* `tv-reveal-group` stages whatever the screen puts inside: these
          screens wait on a vehicle list, a draft or an upload, and without
          it the whole form lands in a single frame. One place rather than
          six -- every add-a-record screen renders through here. */}
      <div className={`${contentClass} tv-reveal-group`}>{children}</div>
    </div>
  );
}
