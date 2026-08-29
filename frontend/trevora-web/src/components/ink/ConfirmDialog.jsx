import React, { useEffect, useRef, useState } from 'react';

/**
 * Confirmation for a destructive, unrecoverable action.
 *
 * Deleting is a hard delete with no undo, and the history is the whole point
 * of the product — so the dialog does three things a plain "Are you sure?"
 * does not:
 *
 * - **States the damage in numbers.** "This also removes 6 service records"
 *   is the fact that changes minds; "this cannot be undone" is wallpaper
 *   everyone clicks past.
 * - **Names the thing** in the confirm button, so a mis-aimed click on the
 *   wrong row is visible before it lands rather than after.
 * - **Defaults to safety.** Focus lands on Cancel, Escape closes, and the
 *   confirm button is the one you have to travel to.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  error,
  // Deleting is the common case, so it stays the default. Sign out borrows
  // the dialog without borrowing the red: it costs a session, not data, and
  // dressing a recoverable action as a destructive one is how a red button
  // stops meaning anything.
  busyLabel = 'Deleting…',
  tone = 'danger',
  // Lets a caller hold the confirm button shut until some extra condition is
  // met — account deletion makes you type the word first. Defaults to false,
  // so every existing call site behaves exactly as before.
  confirmDisabled = false,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  /* Focus belongs to *opening*, so it depends on `open` alone.

     It used to live in the effect below, next to the key handler, which also
     depends on `busy` and `onCancel`. Callers pass `onCancel` as an inline
     arrow, so its identity changes on every render — and a dialog containing
     a text field re-renders on every keystroke. The effect re-ran and pulled
     focus back to Cancel after each letter, which made the account-deletion
     field impossible to type into.

     Splitting them is the fix: the listener can be torn down and rebuilt as
     often as its dependencies change, while focus is set once, when the
     dialog appears. */
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        dialogRef.current?.querySelectorAll('button:not([disabled])') ?? [],
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="ink-modal__backdrop" onClick={() => { if (!busy) onCancel(); }}>
      <div
        className="ink-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <div id="confirm-body" className="ink-modal__body">{body}</div>

        {error && <p className="ink-modal__error" role="alert">{error}</p>}

        <div className="ink-modal__actions">
          <button
            className="ink-button ink-button--outline"
            type="button"
            ref={cancelRef}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`ink-button ink-button--${tone}`}
            type="button"
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small hook so both call sites share the busy/error handling. */
export function useDeleteAction(action, onDone) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await action();
      setOpen(false);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    busy,
    error,
    ask: () => { setError(''); setOpen(true); },
    cancel: () => { if (!busy) { setOpen(false); setError(''); } },
    confirm,
  };
}
