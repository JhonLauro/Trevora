import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, resolveTheme, setTheme, watchSystemTheme } from '../../theme.js';

/**
 * Light/dark switch.
 *
 * <p>Shows the theme you would get by pressing it, not the one you are in — a
 * moon while the app is light, a sun while it is dark. That is the convention
 * every phone uses for this control, and the alternative reads as a status
 * light rather than a button.
 *
 * <p>Both icons stay mounted and cross-fade, because an icon that is removed
 * from the DOM has nothing to animate out of.
 */
export default function ThemeToggle({ compact = false }) {
  const [theme, setLocalTheme] = useState(resolveTheme);

  useEffect(() => {
    // The device may have changed its mind while this was unmounted, and an
    // owner following their device should still be following it.
    applyTheme(resolveTheme());

    const stopWatching = watchSystemTheme();
    const onChange = (event) => setLocalTheme(event.detail);
    window.addEventListener('trevora:theme-changed', onChange);
    return () => {
      stopWatching();
      window.removeEventListener('trevora:theme-changed', onChange);
    };
  }, []);

  const dark = theme === 'dark';

  function toggle() {
    const next = dark ? 'light' : 'dark';
    setTheme(next);
    setLocalTheme(next);
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      /* Says what pressing it does. `aria-pressed` would describe a state this
         button does not have — there is no "on". */
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <Moon
        className={`theme-toggle__icon${dark ? ' is-hidden' : ' is-shown'}`}
        size={compact ? 17 : 18}
        strokeWidth={1.9}
        aria-hidden="true"
      />
      <Sun
        className={`theme-toggle__icon${dark ? ' is-shown' : ' is-hidden'}`}
        size={compact ? 17 : 18}
        strokeWidth={1.9}
        aria-hidden="true"
      />
    </button>
  );
}
