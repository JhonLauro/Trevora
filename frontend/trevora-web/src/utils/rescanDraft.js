import { deleteServiceDraft } from '../api/serviceDrafts.js';

/**
 * Throw this draft away and go back to photograph a different receipt.
 *
 * <p>Shared by the two dialogs that end this way — the receipt read against
 * the wrong vehicle, and the receipt already in the history. Both are the same
 * conclusion: this draft should not become a record, and the owner needs the
 * upload screen rather than the review one.
 *
 * <p>The draft is deleted rather than abandoned. Left behind it keeps counting
 * itself in the Garage's "needs review" and asking to be finished — a nag for
 * work the owner has just been told not to do.
 *
 * <p>A refused delete stops here and throws, and the caller shows why. It used
 * to navigate on regardless, which was harmless while a failed delete meant a
 * stray draft. Since deletion removes the receipt photos and text too, and is
 * refused outright when they cannot be removed, going on to the upload screen
 * would tell the owner the draft was gone when nothing had been deleted -- the
 * same defect already fixed on the review page's Discard.
 *
 * @throws the server's error, with its message, when the delete is refused
 */
export async function discardDraftAndRescan({ draft, vehicleId, navigate }) {
  const draftId = draft?.draftId ?? draft?.serviceDraftId;
  if (draftId) {
    await deleteServiceDraft(draftId);
  }
  navigate(`/service-input/${vehicleId}/receipt`, { replace: true });
}
