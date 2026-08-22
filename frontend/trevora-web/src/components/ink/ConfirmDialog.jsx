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
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    cancelRef.current?.focus();

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
            className="ink-button ink-button--danger"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Deleting…' : confirmLabel}
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
