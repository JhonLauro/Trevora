import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/index.jsx';

/**
 * "Keep this, or throw it away?" — asked on the way out of the review screen.
 *
 * <p>Three answers, not two, because leaving genuinely has three outcomes and
 * the old prompt only offered the worst one. A draft row already exists by the
 * time this screen renders — scanning, dictating or typing creates it — so
 * walking away never left "nothing behind". It left a half-read draft with the
 * owner's corrections thrown away, which is the one outcome nobody would pick
 * deliberately.
 *
 * <p>So: keep it with the corrections, delete it outright, or stay. The middle
 * one is the reason a plain two-button confirm could not do the job — "cancel"
 * cannot mean both "stay here" and "get rid of it".
 *
 * <p>Keeping is the primary action. Somebody who came this far photographed a
 * receipt on purpose, and the recoverable answer should be the easy one; the
 * destructive answer is a quiet link, spelled out, and never the default focus.
 */
export default function LeaveDraftDialog({ open, saving, onSave, onDiscard, onCancel }) {
  const t = useT();
  const [busy, setBusy] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    /* Focus the dialog itself, not a button: a ring painted on "Save as draft"
       the moment this appears reads as a suggestion nobody made. */
    dialogRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape' && !saving && !busy) {
        event.preventDefault();
        onCancel?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll('button:not([disabled])') ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, saving, busy, onCancel]);

  if (!open) return null;

  async function run(which, action) {
    if (busy || saving) return;
    setBusy(which);
    try {
      await action?.();
    } finally {
      setBusy(null);
    }
  }

  const working = Boolean(busy) || saving;

  return (
    /* Escape and this backdrop both mean "stay", which is the safe answer and
       the one a stray click should land on. Unlike the duplicate and wrong-
       vehicle dialogs, dismissing here decides nothing — the draft is exactly
       as it was. */
    <div className="ink-modal__backdrop" onClick={() => { if (!working) onCancel?.(); }}>
      <div
        className="ink-modal leave-draft"
        role="alertdialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="leave-draft-title"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="leave-draft-title">{t('leave.title')}</h2>

        <div className="ink-modal__body">
          <p>{t('leave.body')}</p>
        </div>

        <div className="ink-modal__actions leave-draft__actions">
          <button
            className="ink-button ink-button--outline"
            type="button"
            disabled={working}
            onClick={() => onCancel?.()}
          >
            {t('leave.stay')}
          </button>
          <button
            className="ink-button ink-button--primary"
            type="button"
            disabled={working}
            onClick={() => run('save', onSave)}
          >
            {busy === 'save' ? t('leave.saving') : t('leave.saveDraft')}
          </button>
        </div>

        {/* Set apart from the pair above, and named for what it removes rather
            than what it cancels: "Discard" alone reads as discarding the edits,
            when it deletes the whole draft and the receipt pages with it. */}
        <div className="leave-draft__destructive">
          <button
            className="ink-link-button ink-link-button--danger"
            type="button"
            disabled={working}
            onClick={() => run('discard', onDiscard)}
          >
            {busy === 'discard' ? t('leave.discarding') : t('leave.discard')}
          </button>
        </div>
      </div>
    </div>
  );
}
