import React from 'react';

/**
 * Side-profile silhouettes for the body-type picker.
 *
 * A shape is the right medium for this question — "sedan" and "pickup" are
 * visual categories, and recognising an outline is faster than parsing "four
 * doors with a separate closed boot".
 *
 * **These are drawn to be told apart, not to be accurate.** The first version
 * failed because every car was the same body with a slightly different
 * roofline, and at 72px that is one shape shown six times. Each silhouette
 * now leans on the traits that survive being shrunk:
 *
 * - overall length — the hatchback is dramatically shorter than the sedan
 * - roof height — the SUV and van sit far taller than the sedan
 * - wheel size and ground clearance — biggest on the SUV, smallest on the
 *   hatchback and MPV
 * - one silhouette-defining feature each: the sedan's stepped boot, the
 *   hatchback's single unbroken drop from roof to tail, the MPV's steeply
 *   raked windscreen starting almost at the bumper, the van's flat upright
 *   nose, the pickup's drop from cab roof to bed rail.
 *
 * Real proportions would make several of these near-identical. Exaggeration
 * is the point.
 *
 * The examples beside each option still do work no drawing can: an MPV and a
 * van are close cousins even exaggerated, and "Innova" against "Hiace"
 * separates them instantly.
 *
 * Swapping in proper art means replacing the paths here and nothing else.
 * Unrelated to the parts-map artwork — no hotspots, no per-view variants, no
 * geometry to keep aligned.
 */
const VIEW_BOX = '0 0 76 40';

const SHAPES = {
  /* Long and low, with an unmistakable step down from roof to boot. */
  sedan: {
    body: 'M3 30.5 L3 24 C3 22 4 21 6 20.8 L17 20.5 L25 12.5 C26 11.5 27 11 28.5 11 '
      + 'L44 11 C45.5 11 46.5 11.5 47.5 12.5 L53 20.5 L70 20.8 C72 21 73 22 73 24 L73 30.5 Z',
    wheels: [[19, 30.5, 5.5], [57, 30.5, 5.5]],
  },
  /* Short. The roof runs long and then falls to the tail in one line, with no
     boot shelf, and the tail stops just past the rear wheel. */
  hatchback: {
    body: 'M6 30.5 L6 24 C6 22 7 21 9 20.8 L18 20.5 L25 12 C26 11 27 10.5 28.5 10.5 '
      + 'L50 10.5 C52 10.5 53 11 54 12.5 L60 21 C61.5 22 62 22.5 62 24 L62 30.5 Z',
    wheels: [[18, 30.5, 5.5], [52, 30.5, 5.5]],
  },
  /* Tall, square, big wheels, and real daylight under the body. */
  suv: {
    body: 'M4 22 L4 15 C4 13 5 12.5 7 12.5 L16 12.5 L22 7.5 C23 6.5 24 6 25.5 6 '
      + 'L54 6 C55.5 6 56.5 6.5 57 7.5 L62 12.5 L70 12.5 C72 12.5 73 13 73 15 L73 22 Z',
    wheels: [[19, 28, 7], [57, 28, 7]],
  },
  /* One box: barely any bonnet, then a windscreen raked so hard it runs from
     the bumper to a long high roof. */
  mpv: {
    body: 'M3 30 L3.5 24 C3.7 22.5 4.5 22 6 21.5 L12 20 L22 10.5 C23 9.5 24 9 25.5 9 '
      + 'L55 9 C57 9 58 9.5 59 11 L65 20 C67 21 68 21.5 68.5 23 L69 30 Z',
    wheels: [[19, 30, 5.5], [57, 30, 5.5]],
  },
  /* The step from cab roof to bed rail is the whole tell, so it is a big one. */
  pickup: {
    body: 'M4 29 L4 20 C4 18 5 17.5 7 17.5 L14 17.5 L20 9 C21 8 22 7.5 23.5 7.5 '
      + 'L40 7.5 C41.5 7.5 42 8 42 9.5 L42 18.5 L70 18.5 C71.5 18.5 72 19 72 20.5 L72 29 Z',
    wheels: [[19, 29, 6], [58, 29, 6]],
  },
  /* Nearly a rectangle: upright nose, one flat roof the whole length. */
  van: {
    body: 'M4 29 L4 15 L10 9 C11 8.5 12 8.3 13.5 8.3 L66 8.3 C68.5 8.3 70 9.3 70 11.8 '
      + 'L70 29 Z',
    wheels: [[17, 29, 6], [59, 29, 6]],
  },
};

/**
 * Filled, chunky, and low-slung — the previous version was drawn in thin
 * strokes with skinny ring wheels, which is a bicycle. What separates a
 * motorcycle from a bicycle in silhouette is **mass**: fat tyres and a solid
 * body filling the space between them, rather than a frame made of lines.
 *
 * The three bikes are told apart the same way the six cars are: by the one
 * trait that survives 72px. The scooter has a tall leg shield closing the
 * front and an unbroken floorboard; the underbone breaks that floor with a
 * bare cylinder hanging below it; the big bike has no shield at all and a
 * tank filling the space the scooter leaves empty.
 */
function Scooter() {
  return (
    <g fill="currentColor">
      <circle cx="16" cy="27" r="8.5" />
      <circle cx="60" cy="27" r="8.5" />
      {/* Handlebar */}
      <path d="M17 7 L31 7 C32 7 32.5 7.6 32.5 8.5 L32.5 10 C32.5 10.9 32 11.5 31 11.5 L17 11.5 C16 11.5 15.5 10.9 15.5 10 L15.5 8.5 C15.5 7.6 16 7 17 7 Z" />
      {/* Leg shield, leaning back from the front wheel */}
      <path d="M22 10 L30 10 L31 22 L25 23 Z" />
      {/* Floorboard and the low body mass between the wheels */}
      <path d="M25 22 L48 22 L52 30 L27 30 Z" />
      {/* Seat and rear body */}
      <path d="M36 22 L39 16 C40 14.5 41.5 14 43.5 14 L57 14 C60 14 61.5 15 62.5 17.5 L66 26 L60 28 L44 26 L38 24 Z" />
    </g>
  );
}

/**
 * Underbone — the step-through is still there, but the floor is broken by a
 * horizontal cylinder slung under it and the leg shield stops low. Those two
 * things are the whole difference from the scooter at this size.
 */
function Underbone() {
  return (
    <g fill="currentColor">
      <circle cx="16" cy="27" r="8.5" />
      <circle cx="60" cy="27" r="8.5" />
      {/* Handlebar */}
      <path d="M17 7 L31 7 C32 7 32.5 7.6 32.5 8.5 L32.5 10 C32.5 10.9 32 11.5 31 11.5 L17 11.5 C16 11.5 15.5 10.9 15.5 10 L15.5 8.5 C15.5 7.6 16 7 17 7 Z" />
      {/* Short leg shield — stops well above the floor */}
      <path d="M23 10 L29.5 10 L30 17 L25 17.5 Z" />
      {/* Backbone spine running back from the headstock */}
      <path d="M24 12 L38 18 L38 21.5 L24 15.5 Z" />
      {/* Floor, narrower than the scooter's */}
      <path d="M26 20 L40 20 L41 24 L27 24 Z" />
      {/* The tell: a bare horizontal cylinder hanging below the floor line */}
      <path d="M31 24 L45 24 L47 30.5 L33 30.5 Z" />
      {/* Seat and rear body */}
      <path d="M38 20 L41 15 C42 13.8 43.5 13.3 45.5 13.3 L58 13.3 C61 13.3 62.5 14.3 63.5 16.8 L66 24 L60 26 L45 24 L39 22 Z" />
    </g>
  );
}

/**
 * Big bike — no shield, no step-through. The tank is the mass that fills the
 * space the other two leave open between the bars and the seat, and the
 * engine sits high between the wheels rather than under a floor.
 */
function BigBike() {
  return (
    <g fill="currentColor">
      <circle cx="15" cy="26" r="9.5" />
      <circle cx="61" cy="26" r="9.5" />
      {/* Handlebar, lower and further forward than a scooter's */}
      <path d="M19 8 L32 8 C33 8 33.5 8.6 33.5 9.5 L33.5 11 C33.5 11.9 33 12.5 32 12.5 L19 12.5 C18 12.5 17.5 11.9 17.5 11 L17.5 9.5 C17.5 8.6 18 8 19 8 Z" />
      {/* Front fork, left bare — nothing encloses the front of this bike */}
      <path d="M21 11 L26.5 11 L31 23 L26 23 Z" />
      {/* Fuel tank: the signature. Swells up between bars and seat. */}
      <path d="M29 18 C31 14.2 34 12.5 39 12.3 L50 12 L51 19.5 L31 21.5 Z" />
      {/* Seat and tail, running flat off the back of the tank */}
      <path d="M48 12.5 L60 12.5 C63 12.5 64.5 13.5 65.5 16 L67 20.5 L60 22 L48 20 Z" />
      {/* Engine mass, high and exposed between the wheels */}
      <path d="M31 21 L52 19.5 L54 29 L33 30.5 Z" />
    </g>
  );
}

const BIKE_GLYPHS = {
  scooter: Scooter,
  underbone: Underbone,
  motorcycle: BigBike,
};

export default function BodyTypeGlyph({ bodyType }) {
  const Bike = BIKE_GLYPHS[bodyType];
  if (Bike) {
    return (
      <svg className="body-glyph" viewBox={VIEW_BOX} aria-hidden="true" focusable="false">
        <Bike />
      </svg>
    );
  }

  const shape = SHAPES[bodyType];
  if (!shape) return null;

  return (
    <svg className="body-glyph" viewBox={VIEW_BOX} aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <path d={shape.body} />
        {shape.wheels.map(([cx, cy, r]) => <circle key={cx} cx={cx} cy={cy} r={r} />)}
      </g>
    </svg>
  );
}
