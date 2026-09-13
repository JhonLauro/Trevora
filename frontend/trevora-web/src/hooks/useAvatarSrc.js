import { useEffect, useState } from 'react';
import { cachedAvatarSrc, resolveAvatarSrc } from '../api/profilePhoto.js';

/** How often a mounted avatar re-checks its link. Most checks never reach the
    network: a signed link is reused until it is 45 minutes old. */
const RECHECK_MS = 5 * 60 * 1000;

/**
 * What to put in an avatar's `src` for the photo pointer on the account.
 *
 * Profile photos are in a private bucket, so the stored URL cannot be drawn as
 * it is. This hands back a signed link for it and renews the link while the
 * screen stays open. A photo that is not ours (Google's) comes back unchanged.
 * '' means there is nothing to draw yet -- show the initials.
 */
export default function useAvatarSrc(avatar) {
  const [src, setSrc] = useState(() => cachedAvatarSrc(avatar));

  useEffect(() => {
    let active = true;
    /* A photo already on screen stays until its replacement is signed, rather
       than blinking to initials in between. */
    const immediate = cachedAvatarSrc(avatar);
    if (immediate || !avatar) setSrc(immediate);

    function refresh() {
      resolveAvatarSrc(avatar).then((next) => {
        if (active) setSrc(next);
      });
    }

    refresh();
    const timer = avatar ? window.setInterval(refresh, RECHECK_MS) : null;
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [avatar]);

  return src;
}
