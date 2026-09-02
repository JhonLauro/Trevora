import React from 'react';

/**
 * The hand-off between the walkthrough and the vehicle form.
 *
 * <p>It exists because that click is the one moment in signup where the
 * product stops explaining and starts asking. A cut between the two screens
 * reads as a page load; a car pulling in reads as arriving somewhere, which is
 * what "add your first vehicle" is meant to feel like.
 *
 * <p>The label says what the next screen is for. It read "Opening your garage"
 * to begin with, which is the wrong screen entirely — this leads to the form
 * that creates a vehicle, and the garage is somewhere the owner has not been
 * yet. Pass `label` to reuse this for a different destination.
 *
 * <p>Five seconds by default, which is long enough that it is a journey rather
 * than a wipe: the car arrives, drives, and leaves the frame as the next page
 * takes over. It is also long enough to need an escape, so any click or key
 * skips it — see the listener in WelcomePage.
 *
 * <p>`durationMs` retimes the whole sequence: the CSS is percentages of
 * `--gt-run`, so the arc holds its shape at any length. A caller that shortens
 * it must shorten its own timer to match, and should drop the skip hint with
 * `hint={null}` unless it actually listens for the skip — a two-second overlay
 * is over before the offer can be taken up.
 *
 * <p>It is decorative and it is also a status: the wheels and the road are
 * `aria-hidden`, and the line of text underneath is what a screen reader gets,
 * announced politely rather than interrupting. Under `prefers-reduced-motion`
 * the caller skips this component entirely and navigates straight through —
 * see `startLeaving` in WelcomePage.
 */
export default function GarageTransition({
  label = 'Let’s add your vehicle',
  durationMs = 5000,
  hint = 'Tap anywhere to skip',
}) {
  return (
    <div
      className="gt"
      role="status"
      aria-live="polite"
      style={{ '--gt-run': `${durationMs}ms` }}
    >
      <div className="gt__stage">
        {/* Side profile, because a car seen from the side is the only angle
            that reads as moving.

            Drawn from four simple shapes rather than one clever path: a
            rounded body, a trapezoid cabin, two window panes and two wheels.
            The first version of this was a single hand-written bezier and it
            came out misshapen — geometry you can check coordinate by
            coordinate is worth more here than geometry that is elegant on
            paper. The wheels are drawn last so they sit over the body and
            read as wheels rather than as holes in it. */}
        <svg className="gt__car" viewBox="0 0 200 84" aria-hidden="true">
          <rect className="gt__body" x="8" y="40" width="184" height="28" rx="12" />
          <path className="gt__body" d="M60 42 L73 20 Q75 17 79 17 H123 Q127 17 129 20 L142 42 Z" />
          <path className="gt__glass" d="M69 38 L78 23 H97 V38 Z" />
          <path className="gt__glass" d="M103 23 H122 L133 38 H103 Z" />
          <rect className="gt__lamp" x="180" y="46" width="9" height="7" rx="3" />

          <g className="gt__wheel" transform="translate(58 66)">
            <g className="gt__spin">
              <circle className="gt__tyre" r="14" />
              <circle className="gt__hub" r="5.5" />
              <path className="gt__spoke" d="M0-9.5v19M-9.5 0h19" />
            </g>
          </g>
          <g className="gt__wheel" transform="translate(146 66)">
            <g className="gt__spin">
              <circle className="gt__tyre" r="14" />
              <circle className="gt__hub" r="5.5" />
              <path className="gt__spoke" d="M0-9.5v19M-9.5 0h19" />
            </g>
          </g>
        </svg>

        {/* Three lanes of road streaming the other way. The car itself barely
            translates — the ground moving is what sells the motion, and it
            keeps the car centred and legible instead of a blur. */}
        <div className="gt__road" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <p className="gt__label">{label}</p>
      {/* Five seconds is long enough that it has to be escapable, and long
          enough that saying so is worth the line. The listener is in
          WelcomePage — any click or key cuts it short. A shorter caller passes
          `hint={null}`: an offer to skip that expires in two seconds is worse
          than no offer. */}
      {hint && <p className="gt__hint">{hint}</p>}
    </div>
  );
}
