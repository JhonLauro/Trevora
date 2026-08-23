/**
 * Geometry for the parts map: which views a vehicle gets, how big each drawing
 * is, and where the marker for each component sits in it.
 *
 * The artwork itself lives in `vehicleDrawings.jsx`. Separate again from
 * `BodyTypeGlyph`, which draws 72px silhouettes for the picker — those are
 * exaggerated to be told apart at a glance and carry no anchors.
 *
 * **Two views, not four.** Front and rear were dropped. They existed to hold
 * lights, brakes and exhaust, all of which the side profile already carries at
 * both ends of the vehicle, so deleting them costs no component. They were
 * also the two views that duplicated each other's outline, ignored body type
 * entirely, and so showed a pickup owner somebody else's vehicle.
 *
 * **The bonnet keeps its own canvas.** Seven components live under a car's
 * bonnet, inside a region about 90 units wide on a side profile. At marker
 * radius 13 with 30 units of clearance they do not fit, and relocating them
 * until they do is the lie the second drawing avoids.
 *
 * **Side is per body type; the second view is per powertrain family.** The side profile is
 * the view every owner recognises, so that is where the per-type effort goes.
 * An MPV's bay and a pickup's bay genuinely look alike, and neither owner has
 * ever seen theirs from directly above, so one shared drawing there is honest
 * rather than lazy.
 *
 * **Each component appears in one view, with a single deliberate exception** —
 * a car's brakes are at the wheels, its cooling system is under the bonnet, so
 * the two views partition the taxonomy rather than overlapping. The exception
 * is `drive` on a scooter: the CVT case is visible from the side *and* is the
 * subject of the engine view, because it carries the rear wheel. Marker
 * numbers are global (the component's position in the class taxonomy), not per
 * view, so 5 is Tires on every tab and every body type — including the
 * component that appears twice.
 *
 * All twelve drawings are 640 units wide and vary in height, so they render at
 * one consistent scale in the panel: a van is visibly taller than a sedan, a
 * pickup visibly longer in the wheelbase.
 *
 * Anchors are literal per drawing rather than derived from landmarks. Once the
 * side views stopped being proportional variants of one template, a formula
 * would only have hidden where the numbers came from — and two anchors no
 * longer follow one anyway: `body` sits on the door panel rather than the
 * glass, and `suspension` sits in the fender above the arch, both to clear the
 * redrawn wheel.
 */
import {
  CAR_BAY,
  HATCHBACK,
  MOTORCYCLE,
  MOTORCYCLE_BAY,
  MPV,
  PICKUP,
  SCOOTER,
  SCOOTER_BAY,
  SEDAN,
  SUV,
  UNDERBONE,
  VAN,
} from './vehicleDrawings.jsx';

export const MARKER_RADIUS = 13;

/* Anchors in one drawing must stay at least 30 units apart. Not 26 (two
   markers just touching) because a selected marker carries a halo out to
   radius 20: at 30 apart two selected neighbours touch but never overlap. The
   closest pair in the set below is 49, on the motorcycle — anything moved has
   to be re-checked against 30. */

const SIDE_SHAPES = {
  sedan: {
    art: SEDAN,
    viewBox: '0 0 640 300',
    anchors: {
      lights: [52, 190], body: [300, 196], suspension: [168, 158],
      brakes: [168, 230], tires: [455, 257], exhaust: [566, 253],
    },
  },

  hatchback: {
    art: HATCHBACK,
    viewBox: '0 0 640 296',
    anchors: {
      lights: [130, 186], body: [340, 192], suspension: [208, 154],
      brakes: [208, 226], tires: [457, 253], exhaust: [528, 249],
    },
  },

  suv: {
    art: SUV,
    viewBox: '0 0 640 334',
    anchors: {
      lights: [58, 196], body: [330, 200], suspension: [176, 166],
      brakes: [176, 254], tires: [449, 285], exhaust: [564, 257],
    },
  },

  mpv: {
    art: MPV,
    viewBox: '0 0 640 340',
    anchors: {
      lights: [54, 206], body: [330, 212], suspension: [180, 178],
      brakes: [180, 266], tires: [450, 294], exhaust: [566, 265],
    },
  },

  pickup: {
    art: PICKUP,
    viewBox: '0 0 640 314',
    anchors: {
      lights: [50, 180], body: [300, 186], suspension: [160, 152],
      brakes: [160, 236], tires: [466, 266], exhaust: [568, 241],
    },
  },

  van: {
    art: VAN,
    viewBox: '0 0 640 362',
    anchors: {
      lights: [52, 232], body: [340, 220], suspension: [160, 198],
      brakes: [160, 286], tires: [465, 315], exhaust: [568, 289],
    },
  },

  /* The bare `motorcycle` id is the big bike, and doubles as the fallback for
     every bike registered before the split. */
  motorcycle: {
    art: MOTORCYCLE,
    viewBox: '0 0 640 340',
    anchors: {
      lights: [206, 150], fairings: [330, 156], suspension: [176, 214],
      brakes: [150, 256], tires: [522, 220], exhaust: [512, 300], drive: [424, 292],
    },
  },

  scooter: {
    art: SCOOTER,
    viewBox: '0 0 640 330',
    anchors: {
      lights: [196, 146], fairings: [250, 180], suspension: [172, 206],
      brakes: [142, 268], tires: [490, 268], exhaust: [540, 290], drive: [440, 246],
    },
  },

  underbone: {
    art: UNDERBONE,
    viewBox: '0 0 640 330',
    anchors: {
      lights: [198, 140], fairings: [400, 172], suspension: [178, 200],
      brakes: [150, 262], tires: [488, 262], exhaust: [516, 296], drive: [452, 282],
    },
  },
};

const BAY_SHAPES = {
  car: {
    art: CAR_BAY,
    viewBox: '0 0 640 430',
    anchors: {
      cooling: [320, 140], fluids: [506, 130], battery: [126, 257],
      airFilter: [527, 223], engine: [322, 250], ac: [183, 346], transmission: [322, 364],
    },
  },

  motorcycle: {
    art: MOTORCYCLE_BAY,
    viewBox: '0 0 640 430',
    anchors: {
      cooling: [136, 262], airFilter: [336, 132], battery: [496, 206],
      engine: [300, 330], fluids: [268, 362],
    },
  },

  scooter: {
    art: SCOOTER_BAY,
    viewBox: '0 0 640 430',
    anchors: {
      drive: [500, 268], cooling: [118, 256], airFilter: [406, 136],
      battery: [202, 124], engine: [308, 252], fluids: [322, 332],
    },
  },
};

/* Which second-view drawing a body type gets. Anything absent is a car. */
const POWERTRAIN = {
  scooter: 'scooter',
  underbone: 'motorcycle',
  motorcycle: 'motorcycle',
};

const BAY_LABELS = {
  car: 'Under the bonnet',
  motorcycle: 'Engine and frame',
  scooter: 'Engine and CVT',
};

/**
 * Every view available for a vehicle, in the order they are offered.
 *
 * @returns {{id, label, shape}[]} empty when the body type is unknown — see
 *   `hasVehicleShape`.
 */
export function vehicleViews(bodyType) {
  const side = SIDE_SHAPES[bodyType];
  if (!side) return [];

  // The second view splits on powertrain family, not on body type. A scooter's
  // CVT unit and a chain-driven engine in a frame share nothing, so they get
  // separate drawings; an underbone and a big bike share both, so they share
  // one. Cars all share the bay — an MPV's and a pickup's genuinely look alike.
  const bay = BAY_SHAPES[POWERTRAIN[bodyType]] ?? BAY_SHAPES.car;

  return [
    { id: 'side', label: 'Side', shape: side },
    {
      id: 'engineBay',
      // A bike has no bay to look down into, so its second drawing is a
      // left-side close-up and the tab has to say something else.
      label: BAY_LABELS[POWERTRAIN[bodyType]] ?? BAY_LABELS.car,
      shape: bay,
    },
  ];
}

export function hasVehicleShape(bodyType) {
  return Boolean(SIDE_SHAPES[bodyType]);
}
