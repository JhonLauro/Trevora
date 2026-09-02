/**
 * Answer the question rather than leaving it.
 *
 * <p>Both review dialogs used to close when the backdrop was clicked or Escape
 * was pressed. That reads like "cancel", but neither of these has a cancel:
 * closing the duplicate dialog means "it is a different service", and closing
 * the vehicle one means "use it anyway". Both are answers, and both were being
 * recorded for people who had not given them — a stray click beside a dialog is
 * the single easiest thing to do by accident on a phone.
 *
 * <p>So the backdrop no longer dismisses. A backdrop that simply ignores the
 * click is worse than one that closes, though, because nothing explains the
 * refusal — you click again, harder, and conclude the page has hung. This
 * nudges the dialog instead, which is the one gesture that reads as "not that
 * way, answer here" without any text.
 *
 * <p>Nobody is trapped by this. Both dialogs put both answers on screen, one
 * click apart, and the focus trap already reaches them by keyboard.
 */

/* Reduced, not removed. Somebody who asked for less motion still needs to be
   told why their click did nothing — they are the ones who cannot be shown it
   a second time. A 2px settle is legible without being a shake. */
function amplitude() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  return reduced ? 2 : 6;
}

export function insistOnAnswer(element) {
  /* Web Animations rather than a CSS class: restarting a CSS animation needs
     the class removed, a reflow forced and the class re-added, and this fires
     on exactly the repeated clicks that hack exists to survive. Calling
     animate() again just plays it again. */
  if (!element?.animate) return;

  const throwBy = amplitude();
  element.animate(
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(-${throwBy}px)` },
      { transform: `translateX(${throwBy}px)` },
      { transform: 'translateX(0)' },
    ],
    { duration: throwBy > 2 ? 260 : 180, easing: 'ease-in-out' },
  );
}
