import { useLocation } from 'react-router-dom';

/**
 * Where "Back to Trevora" should actually go.
 *
 * <p>It used to be a hardcoded `to="/"`. That is right when the reader arrived
 * from the footer of the landing page and wrong in the case that matters: the
 * signup form links to both documents from its consent checkbox, so anyone who
 * stopped to read what they were agreeing to was returned to the marketing page
 * with a half-filled form thrown away. The one link on the page that promises to
 * take you back was the one that lost your work.
 *
 * <p>So the caller says where it sent you from, and this reads it back. Links
 * that stay inside the legal pages — Terms to Privacy, and the cross-reference
 * in each document's last paragraph — forward the same value, or the origin
 * would be forgotten by the second page and the reader stranded again.
 *
 * <p>Nothing is threaded through the URL: it travels in router state, so the
 * documents keep shareable addresses. A reader who opens /terms directly has no
 * state at all, which is why the fallback stays "/".
 */

/* The label names the destination. "Back to Trevora" pointing at a signup form
   is a small lie, and this link exists to be trusted about where it goes. */
const RETURN_LABELS = {
  '/register': 'Back to sign up',
  '/register/vehicle': 'Back to sign up',
  '/login': 'Back to sign in',
};

export function useLegalReturn() {
  const { state } = useLocation();
  const from = typeof state?.from === 'string' ? state.from : null;

  /* Only an in-app path. Router state is not attacker-controlled the way a
     query parameter is, but a link whose destination comes from data should
     never be able to name another site — "//evil.example" is a protocol-
     relative URL, not a path, which is the one that catches people out. */
  const safe = from && from.startsWith('/') && !from.startsWith('//') ? from : null;

  return {
    backTo: safe ?? '/',
    backLabel: RETURN_LABELS[safe] ?? 'Back to Trevora',
    /* Spread onto `state` for any link that stays within the legal pages.
       `undefined` when there is nothing to carry, so those links behave
       exactly as they did before for a reader who arrived cold. */
    carry: safe ? { from: safe } : undefined,
  };
}
