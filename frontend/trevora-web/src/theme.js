/**
 * Light or dark, and who decides.
 *
 * <p>Two states. Trevora opens light for everybody, on every device, and stays
 * light until the owner presses the toggle; from then on their choice holds on
 * that device until they change it again.
 *
 * <p>It used to follow `prefers-color-scheme` for anyone who had never chosen.
 * That was the better-behaved design in the abstract and it is deliberately
 * gone: light is the theme the product is drawn in and the one every screen is
 * checked against, and a device-dark owner was landing in a theme neither they
 * nor we had asked for. Anyone who wants dark can still have it in one press —
 * the difference is that it is now something you choose rather than something
 * your phone chooses for you.
 *
 * <p>localStorage, deliberately, where the walkthrough flag and the tips are
 * server-side. Those are facts about a person: whether they have been shown
 * something is true wherever they sign in. This is a fact about a screen —
 * dark at night on a phone, light on a desktop by a window is a coherent thing
 * to want, and syncing it would overwrite one with the other.
 */
const STORAGE_KEY = 'trevora.theme';

/** What everyone gets until they say otherwise. */
const DEFAULT_THEME = 'light';

/** The stored choice, or null when the owner has never made one. */
export function storedTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    // Private windows and blocked site data throw on access.
    return null;
  }
}

export function resolveTheme() {
  return storedTheme() ?? DEFAULT_THEME;
}

/**
 * Paints the theme.
 *
 * <p>The attribute goes on <html> rather than <body> so that nothing —
 * including the page background the browser paints before React exists — can
 * render outside it.
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

/** Records a deliberate choice and paints it. */
export function setTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // See above. The theme still applies for this page.
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('trevora:theme-changed', { detail: theme }));
}

/**
 * Kept as a no-op so callers need not care that the device no longer votes.
 *
 * <p>This used to subscribe to `prefers-color-scheme` and repaint anyone who
 * had not chosen for themselves. Light is now the default for everyone, so
 * there is nothing to follow: a phone going dark at sunset must not move an
 * owner off the theme the product opened in. Returns the same unsubscribe
 * shape it always did.
 */
export function watchSystemTheme() {
  return () => {};
}
