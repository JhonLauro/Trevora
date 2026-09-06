import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';

/**
 * Lets a screen say "ask me before you leave", and lets the sidebar ask.
 *
 * <p>React Router's own {@code useBlocker} is not available here: it needs a
 * data router, and the app mounts a plain {@code BrowserRouter}. Rather than
 * restructure routing for one prompt, the two sides agree on a handshake — a
 * screen registers a question, and every in-app link that leaves the page puts
 * that question first.
 *
 * <p>The registered handler returns {@code true} to let the navigation happen
 * and {@code false} to stop it, in which case the handler has taken over: it
 * knows where the click was headed, and finishes the journey itself once the
 * reader has answered.
 *
 * <p>Only one screen guards at a time — the deepest one mounted wins, and the
 * registration is released on unmount. A guard left behind by a screen that has
 * gone would block navigation from pages that never asked for it.
 */

const LeaveGuardContext = createContext(null);

export function LeaveGuardProvider({ children }) {
  const handlerRef = useRef(null);

  const register = useCallback((handler) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);

  /**
   * Whether a navigation to `to` may proceed right now.
   *
   * <p>True when nothing is guarding, so every caller can ask unconditionally
   * rather than knowing which screens care.
   */
  const mayLeave = useCallback((to) => {
    const handler = handlerRef.current;
    if (!handler) return true;
    return handler(to) !== false;
  }, []);

  const value = React.useMemo(() => ({ register, mayLeave }), [register, mayLeave]);
  return <LeaveGuardContext.Provider value={value}>{children}</LeaveGuardContext.Provider>;
}

function useLeaveGuardContext() {
  return useContext(LeaveGuardContext);
}

/**
 * Ask before this screen is navigated away from.
 *
 * <p>`handler` receives the destination and returns false to stop the
 * navigation. Pass a falsy `handler` to guard nothing — a screen whose draft
 * has been saved has no question left to ask.
 */
export function useLeaveGuard(handler) {
  const context = useLeaveGuardContext();

  /* The handler is read through a ref so a guard registered once is not torn
     down and re-registered on every keystroke in the form behind it. */
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!context || !handler) return undefined;
    return context.register((to) => latest.current?.(to));
  }, [context, Boolean(handler)]);
}

/** For links: call before navigating, and skip the navigation if it returns false. */
export function useMayLeave() {
  const context = useLeaveGuardContext();
  return context?.mayLeave ?? (() => true);
}
