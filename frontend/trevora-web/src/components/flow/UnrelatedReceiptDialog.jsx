import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { useNavigate } from 'react-router-dom';
import { discardDraftAndRescan } from '../../utils/rescanDraft.js';
import { insistOnAnswer } from '../../utils/insistOnAnswer.js';

/**
 * The receipt was read, and it is not about a vehicle.
 *
 * <p>The extraction files every page under a document type, and NOT_A_RECEIPT
 * covers a grocery receipt, a restaurant bill or a utility statement as well as
 * a photo of something else. Those pass every check before this one: they are
 * sharp, they print amounts and dates, and they are receipts -- only not for
 * the car. Left alone, one becomes a "service" in the history with a total and
 * no work.
 *
 * <p>Asked, not refused, the same way as the wrong-vehicle dialog: the model can
 * be wrong, and scanning the same paper again would get the same answer with no
 * way past it. So starting over is the loud option and keeping it is the quiet
 * one.
 */
export function isUnrelatedReceipt(draft) {
  return draft?.documentType === 'NOT_A_RECEIPT';
}

export default function UnrelatedReceiptDialog({ draft, vehicleId, onDismiss }) {
  const t = useT();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    // The dialog takes focus rather than a button; see VehicleDetailsDialog.
    dialogRef.current?.focus();

    function onKeyDown(event) {
      // Escape would mean "keep it" without saying so; this wants an answer.
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!saving) insistOnAnswer(dialogRef.current);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not([disabled])') ?? []);
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
  }, [saving]);

  // Deleted rather than left behind, and a refused delete keeps the dialog
  // open with the reason: see discardDraftAndRescan.
  async function scanAgain() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await discardDraftAndRescan({ draft, vehicleId, navigate });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div
      className="ink-modal__backdrop"
      onClick={() => {
        if (saving) return;
        insistOnAnswer(dialogRef.current);
        dialogRef.current?.focus();
      }}
    >
      <div
        className="ink-modal vehicle-dialog"
        role="alertdialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="unrelated-dialog-title"
        aria-describedby="unrelated-dialog-body"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="unrelated-dialog-title">{t('unrelated.title')}</h2>

        <div className="ink-modal__body" id="unrelated-dialog-body">
          <p className="vehicle-dialog__lead">{t('unrelated.lead')}</p>
          <p className="vehicle-dialog__advice">{t('unrelated.advice')}</p>
        </div>

        {error && <p className="ink-modal__error" role="alert">{error}</p>}

        <div className="ink-modal__actions">
          <button className="ink-button ink-button--outline" type="button" disabled={saving} onClick={onDismiss}>
            {t('unrelated.keep')}
          </button>
          <button className="ink-button ink-button--primary" type="button" disabled={saving} onClick={scanAgain}>
            {saving ? t('dup.startingOver') : t('unrelated.scanAgain')}
          </button>
        </div>
      </div>
    </div>
  );
}
