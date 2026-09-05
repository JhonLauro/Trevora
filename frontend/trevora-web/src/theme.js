/**
 * Light or dark, and who decides.
 *
 * <p>Three states, not two. An owner who has never touched the toggle follows
 * their device, and follows it live — someone whose phone turns dark at sunset
 * should not have to come back and tell Trevora as well. An owner who *has*
 * chosen keeps their choice, on that device, until they change it.
 *
 * <p>localStorage, deliberately, where the walkthrough flag and the tips are
 * server-side. Those are facts about a person: whether they have been shown
 * something is true wherever they sign in. This is a fact about a screen —
 * dark at night on a phone, light on a desktop by a window is a coherent thing
 * to want, and syncing it would overwrite one with the other.
 */
const STORAGE_KEY = 'trevora.theme';

/** What the device asks for. */
function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

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
  return storedTheme() ?? systemTheme();
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
 * Follows the device for as long as the owner has not overridden it.
 *
 * <p>Checked at the moment the device changes rather than at startup, because
 * a choice made after this was wired up still has to win.
 */
export function watchSystemTheme() {
  const query = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!query) return () => {};

  const onChange = (event) => {
    if (storedTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('trevora:theme-changed', { detail: resolveTheme() }));
  };

  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
