import { useEffect, useState } from 'react';
import { loadOnboardingState } from '../api/onboarding.js';

/**
 * The onboarding state, resolved once per page load.
 *
 * <p>`ready` is false only while the first request is in flight. Nothing is
 * rendered in that window — a redirect decided a moment later would otherwise
 * show the garage and snatch it away, which reads as a bug rather than as a
 * guided step.
 */
export default function useOnboardingGate() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let active = true;
    loadOnboardingState().then((resolved) => {
      if (active) setState(resolved);
    });
    return () => { active = false; };
  }, []);

  return {
    ready: state !== null,
    walkthroughDone: state?.walkthroughDone ?? true,
    hasVehicle: state?.hasVehicle ?? true,
  };
}
