import React, { useEffect, useRef, useState } from 'react';
import { issueText, useT } from '../../i18n/index.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { discardDraftAndRescan } from '../../utils/rescanDraft.js';
import { insistOnAnswer } from '../../utils/insistOnAnswer.js';

/**
 * "This one may already be in your records."
 *
 * <p>The check behind it is not new: DraftPlausibilityService has always
 * flagged a draft whose date, shop and total all match a record this vehicle
 * already has, and its message has always said to delete the draft rather than
 * confirm it. Two things were missing. It rendered as a band that could be
 * scrolled past, and there was no way to act on the advice — drafts could not
 * be deleted at all.
 *
 * <p>It interrupts because of what a duplicate does if it gets through: it
 * inflates the spend total and the years covered, and nobody re-reads a
 * history looking for a service that happened twice. Unlike a wrong value, it
 * cannot be spotted later by looking at the record itself — both copies are
 * individually correct.
 *
 * <p>The band underneath asks the same question in the same words, so one
 * answer settles both — dismissing here dismisses that too. Being asked again
 * by a second surface reads as not having been listened to.
 */
export default function DuplicateDraftDialog({ issue, draft, vehicleId, onDismiss }) {
  const t = useT();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);

  /* Dismissal is reported upward rather than kept here, so that saying "it is
     a different service" settles it once. The band underneath asks the same
     question with the same words; answering the dialog and then being asked
     again by the band reads as not having been listened to. */
  const setDismissed = () => onDismiss?.();
  const dialogRef = useRef(null);

  const open = Boolean(issue);

  useEffect(() => {
    if (!open) return undefined;

    /* The dialog takes focus, not a button.
       Focusing a button on open painted its focus ring the moment the dialog
       appeared -- a green outline on "It is a different service" that nobody
       had asked for, and that stayed put through clicks on either button
       because clicking a button focuses it. Focus has to go somewhere inside
       for the trap and for screen readers, and the WAI-ARIA practice for a
       dialog is the dialog itself: it is announced, it is not a control, and
       it draws no ring. Tab from here still reaches the buttons in order. */
    dialogRef.current?.focus();

    function onKeyDown(event) {
      /* Escape does not close this. It is the same bypass as the backdrop by
         another route, and it would file "it is a different service" on
         somebody's behalf. Both answers are on screen and the trap below
         reaches them. */
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!working) insistOnAnswer(dialogRef.current);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll('a[href], button:not([disabled])') ?? [],
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
  }, [open, working]);

  if (!open) return null;

  async function rescan() {
    if (working) return;
    setWorking(true);
    await discardDraftAndRescan({ draft, vehicleId, navigate });
  }

  return (
    <div
      className="ink-modal__backdrop"
      onClick={() => {
        if (working) return;
        // Not a dismissal. Closing this means "it is a different service",
        // which is an answer, and a click beside the dialog is not one.
        insistOnAnswer(dialogRef.current);
        dialogRef.current?.focus();
      }}
    >
      <div
        className="ink-modal vehicle-dialog"
        role="alertdialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="duplicate-dialog-title"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="duplicate-dialog-title">{t('dup.title')}</h2>

        <div className="ink-modal__body">
          <p className="vehicle-dialog__lead">{issueText(issue, t)}</p>

          {vehicleId && (
            <p className="vehicle-dialog__advice">
              <Link to={`/vehicles/${vehicleId}`}>{t('dup.checkRecords')}</Link>{' '}
              if you are not sure. Nothing has been saved to your history yet.
            </p>
          )}
        </div>

        <div className="ink-modal__actions">
          {/* Kept, and not as an afterthought: two genuine services can share a
              date, a shop and a total — a fleet owner servicing two identical
              cars on one afternoon, or a part refitted the same day it failed.
              The check cannot tell those from a receipt filed twice, so the
              owner has to be able to say so. */}
          <button
            className="ink-button ink-button--outline"
            type="button"
            disabled={working}
            onClick={() => setDismissed()}
          >
            {t('dup.different')}
          </button>
          <button
            className="ink-button ink-button--primary"
            type="button"
            disabled={working}
            onClick={rescan}
          >
            {working ? t('dup.startingOver') : t('dup.rescan')}
          </button>
        </div>
      </div>
    </div>
  );
}
