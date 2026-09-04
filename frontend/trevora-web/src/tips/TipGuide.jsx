import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { isLoggedIn } from '../api/currentUser.js';
import { loadSeenTips, markTipSeen } from '../api/tips.js';
import { tipsForPath } from './registry.js';

/** How long to wait for an anchor that has not rendered yet. */
const ANCHOR_TIMEOUT_MS = 6000;

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Waits for every anchor on this screen to exist, then reports which do.
 *
 * <p>A screen's controls arrive after its data does, so asking once on mount
 * finds nothing on every page that loads anything. This watches instead, and
 * gives up after a few seconds rather than waiting forever for a button that
 * is never coming — an empty garage has no "add record" row to point at.
 *
 * <p>Tips whose anchor never appears are simply not shown, and so are never
 * marked seen. They are spent the first time the element is actually there,
 * which is the only time they would have meant anything.
 */
function waitForAnchors(tips, signal) {
  return new Promise((resolve) => {
    const found = () => tips.filter((tip) => document.querySelector(`[data-tip="${tip.anchor}"]`));

    const immediate = found();
    if (immediate.length === tips.length) {
      resolve(immediate);
      return;
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };

    function onAbort() {
      finish([]);
    }

    const observer = new MutationObserver(() => {
      const ready = found();
      if (ready.length === tips.length) finish(ready);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = window.setTimeout(() => finish(found()), ANCHOR_TIMEOUT_MS);
    signal.addEventListener('abort', onAbort);
  });
}

/** Longest we will wait for a page to stop moving before drawing on it. */
const STILLNESS_TIMEOUT_MS = 1500;

/**
 * Waits for the arrival animations to finish.
 *
 * <p>Every screen in the app reveals itself on load -- `tv-reveal` slides its
 * blocks up into place over a few hundred milliseconds. An element exists from
 * the first frame of that, but it is not where it is going to be, and a
 * spotlight measured against a moving box lands somewhere the box has already
 * left: the shared-access tip drew its card in the top-left corner of the
 * screen while the button it described sat at the top right.
 *
 * <p>Only animations on the anchors and their ancestors are waited for, and
 * never an endless one -- a looping decoration would mean waiting forever, so
 * the timeout is a backstop rather than the mechanism.
 */
function waitForStillness(elements) {
  const running = document.getAnimations().filter((animation) => {
    if (animation.effect?.getTiming().iterations === Infinity) return false;
    const target = animation.effect?.target;
    return target instanceof Element
      && elements.some((element) => target === element || target.contains(element));
  });

  if (running.length === 0) return Promise.resolve();

  return Promise.race([
    Promise.allSettled(running.map((animation) => animation.finished)),
    new Promise((resolve) => { window.setTimeout(resolve, STILLNESS_TIMEOUT_MS); }),
  ]);
}

/**
 * Shows each screen's unseen tips, once per account, and never again.
 *
 * <p>Mounted once at the top of the app rather than per page: the tips belong
 * to a journey that crosses the signup pages and the app shell, and a runner
 * inside one of them could not follow it.
 *
 * <p>Renders nothing.
 */
export default function TipGuide() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isLoggedIn()) return undefined;

    const controller = new AbortController();
    let tour = null;
    let refreshedFor = -1;
    let lastMoveAt = 0;

    /* Two taps landing in the same moment both read the pre-tap step and both
       advance, so one of them is spent on a screen the reader never saw. The
       walkthrough had the same bug and the same fix. A tip skipped this way is
       worse than a tip skipped deliberately: it is still marked as seen, and it
       does not come back. */
    function moveIsAllowed() {
      const now = Date.now();
      if (now - lastMoveAt < 400) return false;
      lastMoveAt = now;
      return true;
    }

    (async () => {
      const seen = await loadSeenTips();
      // Null means the request failed. Showing the whole guide again to an
      // established owner is worse than showing nothing.
      if (!seen || controller.signal.aborted) return;

      const candidates = tipsForPath(pathname, seen);
      if (candidates.length === 0) return;

      const ready = await waitForAnchors(candidates, controller.signal);
      if (ready.length === 0 || controller.signal.aborted) return;

      /* Let the screen settle before measuring anything on it. */
      await waitForStillness(
        ready.map((tip) => document.querySelector(`[data-tip="${tip.anchor}"]`)).filter(Boolean),
      );
      if (controller.signal.aborted) return;

      /* Where they were before the guide moved them. The tips walk down the
         page, so the last one leaves the reader at the bottom of a form they
         have not filled in yet -- and the first thing they would have to do on
         their own is scroll back up. The guide borrowed the viewport, so it
         gives it back. */
      const scrollBefore = window.scrollY;

      tour = driver({
        animate: !prefersReducedMotion(),
        overlayColor: '#1c1b19',
        overlayOpacity: 0.55,
        /* We do the scrolling, in `onHighlightStarted` below. Driver's own
           smooth scroll animates while it is drawing the cutout, so the hole
           is cut where the element used to be. */
        smoothScroll: false,
        allowClose: true,
        popoverClass: 'tip-popover',
        stagePadding: 6,
        stageRadius: 10,
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Got it',
        showButtons: ['next', 'previous', 'close'],
        showProgress: ready.length > 1,
        progressText: '{{current}} of {{total}}',
        steps: ready.map((tip) => ({
          element: `[data-tip="${tip.anchor}"]`,
          popover: { title: tip.title, description: tip.body },
        })),
        /* Bring the element into view before the cutout is drawn.
           The second tip on the add-vehicle page sits well below the fold,
           inside a card that carries a CSS transform from its arrival
           animation and a form with `overflow: hidden`. Advancing to it left
           the popover showing the new step with no spotlight anywhere and the
           previous element still marked as active -- the overlay had been
           removed and not redrawn. Scrolling first, then redrawing on the next
           frame, positions the stage against where the element actually is. */
        onHighlightStarted: (element) => {
          element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        },
        /* Marked as each one is actually put on screen, not all at the end.
           Someone who closes the guide on step one has been shown step one and
           nothing else, and the steps they never saw are still owed to them. */
        onHighlighted: (element, _step, options) => {
          const tip = ready[options.state.activeIndex];
          /* Spent only if it was actually on screen. This is the rule the
             spotlight bug broke: the photo tip was advanced to, drew nothing,
             and was still recorded as seen -- so the account lost a tip it had
             never been shown. Seeing one twice is a small annoyance; losing one
             silently is the whole feature not happening. */
          const box = element?.getBoundingClientRect();
          if (tip && box && box.width > 0 && box.height > 0) markTipSeen(tip.key);

          /* One redraw per step, once the scroll above and any layout still
             settling have finished. A single animation frame was not enough:
             the shared-access tip drew its card against a box that had not
             reached its final position and left it in the corner of the
             screen. Guarded by step index because `refresh` repositions the
             stage and must not become a loop if a future version of the
             library fires this hook again. */
          if (refreshedFor !== options.state.activeIndex) {
            refreshedFor = options.state.activeIndex;
            window.setTimeout(() => tour?.refresh(), 180);
          }
        },
        /* Taking over these three is what makes the guard above possible:
           with a handler set, the button does nothing but call it, so a
           swallowed tap cannot still move the tour underneath us. Each has to
           do the library's own job explicitly as a result. */
        onNextClick: () => {
          if (!moveIsAllowed()) return;
          if (tour.getActiveIndex() >= ready.length - 1) {
            tour.destroy();
          } else {
            tour.moveNext();
          }
        },
        onPrevClick: () => {
          if (!moveIsAllowed()) return;
          tour.movePrevious();
        },
        onCloseClick: () => {
          tour.destroy();
        },
        /* Fires however the guide ends -- the last "Got it", the close button,
           Escape, a click on the overlay. All four leave the reader wherever
           the last tip was, so all four get the scroll position back. */
        onDestroyed: () => {
          window.scrollTo({
            top: scrollBefore,
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          });
        },
      });
      tour.drive();
    })();

    return () => {
      controller.abort();
      tour?.destroy();
    };
  }, [pathname]);

  return null;
}
