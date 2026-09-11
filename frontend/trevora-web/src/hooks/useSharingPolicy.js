import { useEffect, useState } from 'react';
import { getSharingPolicy } from '../api/qrAccess.js';
import { pluralize } from '../utils/format';

/**
 * How long a share link and a mechanic's session last, as the backend enforces
 * them (`SharingPolicy`). Every screen that states a duration reads it from
 * here, so the number is defined once and the share screen, the Terms, the
 * Privacy page and the walkthrough cannot drift apart again.
 *
 * Until it arrives -- or if it cannot be fetched -- the durations read "a few
 * hours": vaguer, never wrong. A hardcoded fallback number would be exactly the
 * copy that drifts.
 */
export default function useSharingPolicy() {
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    let active = true;
    getSharingPolicy().then((value) => {
      if (active) setPolicy(value);
    });
    return () => { active = false; };
  }, []);

  const duration = (hours) => (Number.isFinite(hours) ? pluralize(hours, 'hour') : 'a few hours');

  return {
    linkHours: policy?.linkHours ?? null,
    sessionHours: policy?.sessionHours ?? null,
    linkDuration: duration(policy?.linkHours),
    sessionDuration: duration(policy?.sessionHours),
  };
}
