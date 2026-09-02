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
 * <p>A failed delete does not stop the navigation. Being stuck in a dialog
 * with nowhere to go is a worse outcome than one stray draft, and the draft is
 * still reachable and deletable afterwards.
 */
export async function discardDraftAndRescan({ draft, vehicleId, navigate }) {
  const draftId = draft?.draftId ?? draft?.serviceDraftId;
  if (draftId) {
    try {
      await deleteServiceDraft(draftId);
    } catch {
      // Deliberately swallowed; see above.
    }
  }
  navigate(`/service-input/${vehicleId}/receipt`, { replace: true });
}
