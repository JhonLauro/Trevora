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
 * **Side is per body type; the bay is per vehicle class.** The side profile is
 * the view every owner recognises, so that is where the per-type effort goes.
 * An MPV's bay and a pickup's bay genuinely look alike, and neither owner has
 * ever seen theirs from directly above, so one shared drawing there is honest
 * rather than lazy.
 *
 * **A component may appear in both views** — a car's cooling system is under
 * the bonnet, its brakes are at the wheels. Marker numbers are global (the
 * component's position in the class taxonomy), not per view, so 5 is Tires on
 * every tab and every body type.
 *
 * All nine drawings are 640 units wide and vary in height, so they render at
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
  SEDAN,
  SUV,
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
      brakes: [168, 230], tires: [484, 230], exhaust: [600, 262],
    },
  },

  hatchback: {
    art: HATCHBACK,
    viewBox: '0 0 640 296',
    anchors: {
      lights: [130, 186], body: [340, 192], suspension: [208, 154],
      brakes: [208, 226], tires: [486, 226], exhaust: [566, 258],
    },
  },

  suv: {
    art: SUV,
    viewBox: '0 0 640 334',
    anchors: {
      lights: [58, 196], body: [330, 200], suspension: [176, 166],
      brakes: [176, 254], tires: [482, 254], exhaust: [600, 286],
    },
  },

  mpv: {
    art: MPV,
    viewBox: '0 0 640 340',
    anchors: {
      lights: [54, 206], body: [330, 212], suspension: [180, 178],
      brakes: [180, 266], tires: [480, 266], exhaust: [602, 296],
    },
  },

  pickup: {
    art: PICKUP,
    viewBox: '0 0 640 314',
    anchors: {
      lights: [50, 180], body: [300, 186], suspension: [160, 152],
      brakes: [160, 236], tires: [498, 236], exhaust: [604, 266],
    },
  },

  van: {
    art: VAN,
    viewBox: '0 0 640 362',
    anchors: {
      lights: [52, 232], body: [340, 220], suspension: [160, 198],
      brakes: [160, 286], tires: [496, 286], exhaust: [606, 316],
    },
  },

  motorcycle: {
    art: MOTORCYCLE,
    viewBox: '0 0 640 340',
    anchors: {
      lights: [206, 150], fairings: [330, 156], suspension: [176, 214],
      brakes: [150, 256], tires: [482, 256], exhaust: [512, 300], drive: [424, 292],
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
      cooling: [134, 244], airFilter: [344, 130], battery: [539, 162],
      engine: [292, 228], fluids: [262, 344],
    },
  },
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

  const motorcycle = bodyType === 'motorcycle';

  return [
    { id: 'side', label: 'Side', shape: side },
    {
      id: 'engineBay',
      // A bike has no bay to look down into, so its second drawing is a
      // left-side close-up and the tab has to say something else.
      label: motorcycle ? 'Engine and frame' : 'Under the bonnet',
      shape: motorcycle ? BAY_SHAPES.motorcycle : BAY_SHAPES.car,
    },
  ];
}

export function hasVehicleShape(bodyType) {
  return Boolean(SIDE_SHAPES[bodyType]);
}
