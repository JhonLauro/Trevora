/**
 * Geometry for the parts map: four views of the vehicle, each carrying the
 * components that actually live in it.
 *
 * Separate from `BodyTypeGlyph`, which draws 72px silhouettes for the picker.
 * Those are exaggerated to be told apart at a glance and carry no anchors.
 *
 * **Why four views and not one.** A single side profile has to hold all
 * thirteen components, and seven of them live under the bonnet. Squeezed into
 * one drawing they either collide with the front wheel or have to be relocated
 * somewhere less true to get out of its way. Giving the crowded region its own
 * canvas is the better answer: the engine bay view has room to put the
 * radiator at the front, the battery in its corner and the air filter where it
 * sits, which is more informative than four dots in a grid under a bonnet.
 *
 * **Side view is per body type; the rest are per vehicle class.** A pickup and
 * an MPV have genuinely different profiles, and that is the view where the
 * difference shows. Head-on, from behind, and under the bonnet they are close
 * enough that six near-identical drawings would be six places for the set to
 * drift out of sync rather than six pieces of information.
 *
 * **A component may appear in more than one view**, because some genuinely
 * live in more than one place — a car has lights at both ends, and brakes at
 * every corner. Marker numbers are therefore per view, not global.
 *
 * Side views face left, matching `BodyTypeGlyph`. Side anchors are placed from
 * `landmarks` so a body type contributes about a dozen numbers and inherits
 * the layout; the shared views place theirs directly, since there is one
 * drawing each and a formula would only hide where the numbers came from.
 */

export const MARKER_RADIUS = 13;

/* Side views share one box so stroke weights and marker sizes stay comparable
   between body types. The other views declare their own, since a head-on car
   and a top-down engine bay are not the same shape of picture. */
const SIDE_VIEW_BOX = '0 0 640 300';

const SIDE_SHAPES = {
  sedan: {
    /* Long bonnet, long roof, and a boot deck that steps down behind the rear
       screen — the trait that separates it from the hatchback. */
    body: 'M38 234 C28 234 24 229 24 220 L24 176 C24 160 32 152 48 150 L196 148 L272 80 C280 74 290 72 302 72 '
      + 'L404 72 C416 72 424 75 430 84 L482 148 L592 150 C608 152 616 160 616 176 L616 222 C616 230 612 234 604 234 Z',
    glass: 'M282 90 L400 90 L442 142 L242 142 Z',
    pillars: ['M344 90 L344 142'],
    wheels: [[186, 220, 44], [508, 220, 44]],
    landmarks: {
      nose: 24, tail: 616, roofY: 72, beltY: 150, bodyBottomY: 234,
      cabin: [196, 496], frontAxle: 186, rearAxle: 508, axleY: 220, wheelR: 44,
    },
  },

  hatchback: {
    /* Short. The tail falls from the roof in one line and stops just past the
       rear wheel, with no boot shelf. */
    body: 'M54 234 C44 234 40 229 40 220 L40 176 C40 161 48 153 64 151 L206 149 L280 80 C288 74 298 72 310 72 '
      + 'L430 72 C442 72 450 76 456 86 L534 168 C544 178 548 186 548 198 L548 222 C548 230 544 234 536 234 Z',
    glass: 'M290 90 L426 90 L468 142 L250 142 Z',
    pillars: ['M358 90 L358 142'],
    wheels: [[196, 220, 44], [470, 220, 44]],
    landmarks: {
      nose: 40, tail: 548, roofY: 72, beltY: 150, bodyBottomY: 234,
      cabin: [206, 468], frontAxle: 196, rearAxle: 470, axleY: 220, wheelR: 44,
    },
  },

  suv: {
    /* Tall, with the biggest wheels of the set and real daylight under the
       body — the sedan's roof would sit near this one's beltline. */
    body: 'M34 216 C24 216 22 211 22 202 L22 154 C22 138 30 130 46 128 L190 126 L258 58 C266 52 276 48 290 48 '
      + 'L424 48 C438 48 448 52 454 60 L502 126 L594 128 C610 130 618 138 618 154 L618 204 C618 212 614 216 606 216 Z',
    glass: 'M270 68 L420 68 L462 120 L232 120 Z',
    pillars: ['M346 68 L346 120'],
    wheels: [[190, 218, 54], [512, 218, 54]],
    landmarks: {
      nose: 22, tail: 618, roofY: 48, beltY: 128, bodyBottomY: 216,
      cabin: [190, 500], frontAxle: 190, rearAxle: 512, axleY: 218, wheelR: 54,
    },
  },

  mpv: {
    /* One box: almost no bonnet, then a windscreen raked so hard it runs from
       the bumper up to a long high roof. */
    body: 'M34 234 C24 234 22 229 22 220 L22 178 C22 162 28 152 42 146 L100 136 L196 64 C204 56 214 54 226 54 '
      + 'L424 54 C438 54 446 58 452 68 L516 140 C532 148 542 158 544 174 L546 222 C546 230 542 234 534 234 Z',
    glass: 'M204 74 L422 74 L466 132 L156 132 Z',
    pillars: ['M320 74 L320 132'],
    wheels: [[176, 220, 46], [470, 220, 46]],
    landmarks: {
      nose: 22, tail: 546, roofY: 54, beltY: 140, bodyBottomY: 234,
      cabin: [150, 476], frontAxle: 176, rearAxle: 470, axleY: 220, wheelR: 46,
    },
  },

  pickup: {
    /* The drop from cab roof to bed rail is the whole tell, so it is a big
       one. The cabin box stops at the back of the cab, which keeps the body
       marker off the bed. */
    body: 'M34 232 C24 232 22 227 22 218 L22 170 C22 156 30 146 46 144 L196 142 L254 68 C262 60 270 58 282 58 '
      + 'L396 58 C404 58 408 62 408 72 L408 152 L600 152 C610 152 618 158 618 170 L618 220 C618 228 614 232 606 232 Z',
    glass: 'M268 76 L396 76 L396 136 L234 136 Z',
    pillars: ['M332 76 L332 136'],
    wheels: [[186, 220, 50], [508, 220, 50]],
    landmarks: {
      nose: 22, tail: 618, roofY: 58, beltY: 142, bodyBottomY: 232,
      cabin: [196, 404], frontAxle: 186, rearAxle: 508, axleY: 220, wheelR: 50,
    },
  },

  van: {
    /* Nearly a rectangle: upright nose, one flat roof the whole length. */
    body: 'M34 234 C24 234 22 229 22 220 L22 122 L78 50 C86 42 94 40 108 40 L584 40 C606 40 618 50 618 78 L618 222 C618 230 614 234 606 234 Z',
    glass: 'M100 62 L186 62 L186 124 L64 124 Z',
    extras: ['M204 62 L446 62 L446 124 L204 124 Z'],
    pillars: ['M322 62 L322 124'],
    wheels: [[164, 222, 50], [516, 222, 50]],
    landmarks: {
      nose: 22, tail: 618, roofY: 40, beltY: 132, bodyBottomY: 234,
      cabin: [140, 570], frontAxle: 164, rearAxle: 516, axleY: 222, wheelR: 50,
    },
  },
};

/**
 * The scooter side profile — what most riders here register (Click, Mio,
 * NMAX), and the step-through notch is its signature.
 *
 * **One continuous outline, not a pile of masses.** Two earlier attempts
 * assembled the machine from separate quads and both read as a broken deck
 * chair, because shapes that merely sit near each other do not become one
 * object. Tracing the whole profile as a single closed path makes
 * connectedness structural instead of something the drawing has to fake. The
 * fork stays separate: it genuinely is a spar bridging two bodies.
 */
const MOTORCYCLE_SIDE = {
  masses: [
    'M82 74 L224 74 L224 98 L206 98 '
      + 'C216 126 224 154 230 180 L234 200 L302 202 '
      + 'C318 202 324 180 332 160 C340 144 354 134 374 134 L468 134 '
      + 'C496 134 516 148 522 172 L528 200 C530 214 522 222 508 222 L496 222 '
      + 'C492 196 474 180 450 180 C426 180 410 196 406 220 '
      + 'L360 230 L302 230 L200 228 '
      + 'C184 228 176 220 176 208 L168 120 C166 106 158 98 146 98 L82 98 Z',
    'M112 96 L152 96 L142 196 L118 196 Z',
  ],
  /* The saddle edge. Without it the seat and the tail are one undivided loaf,
     and the shape stops reading as something you sit on. */
  details: ['M368 158 L470 154'],
  wheels: [[128, 212, 54], [450, 212, 54]],
  anchors: {
    lights: [100, 86],
    suspension: [130, 150],
    brakes: [128, 212],
    drive: [388, 206],
    tires: [450, 240],
    fairings: [490, 166],
    exhaust: [520, 208],
  },
};

/**
 * Which components the car side view carries. With the bonnet cluster moved to
 * its own view, this one is down to six markers on a large drawing, which is
 * the whole point of splitting the views up.
 */
function carSideAnchors(landmarks) {
  const { nose, tail, roofY, beltY, bodyBottomY, cabin, frontAxle, rearAxle, axleY, wheelR } = landmarks;
  const [cabinStart, cabinEnd] = cabin;

  return {
    lights: [nose + 16, beltY - 8],
    body: [cabinStart + (cabinEnd - cabinStart) * 0.5, roofY + (beltY - roofY) * 0.45],
    suspension: [frontAxle, axleY - wheelR * 1.15],
    brakes: [frontAxle, axleY],
    tires: [rearAxle, axleY],
    exhaust: [tail - 16, bodyBottomY + 10],
  };
}

/* Head-on. Both front views put the two front tyres in as masses rather than
   circles — edge-on, a tyre is a rounded slab, not a disc. */
const CAR_FRONT = {
  viewBox: '0 0 520 360',
  masses: [
    'M110 300 L104 200 C104 180 110 168 124 160 L150 96 C156 80 168 72 186 72 '
      + 'L334 72 C352 72 364 80 370 96 L396 160 C410 168 416 180 416 200 L410 300 Z',
    'M86 244 C86 238 90 234 96 234 L114 234 C120 234 124 238 124 244 L124 316 '
      + 'C124 322 120 326 114 326 L96 326 C90 326 86 322 86 316 Z',
    'M396 244 C396 238 400 234 406 234 L424 234 C430 234 434 238 434 244 L434 316 '
      + 'C434 322 430 326 424 326 L406 326 C400 326 396 322 396 316 Z',
  ],
  glass: 'M170 100 L350 100 L368 152 L152 152 Z',
  /* Headlamps and grille */
  extras: [
    'M120 176 L182 170 L184 200 L122 206 Z',
    'M400 176 L338 170 L336 200 L398 206 Z',
    'M200 212 L320 212 L320 252 L200 252 Z',
  ],
  anchors: {
    lights: [150, 188],
    engine: [260, 186],
    battery: [358, 196],
    cooling: [260, 250],
    brakes: [105, 286],
  },
};

const CAR_REAR = {
  viewBox: '0 0 520 360',
  masses: [
    'M110 300 L104 200 C104 180 110 168 124 160 L150 96 C156 80 168 72 186 72 '
      + 'L334 72 C352 72 364 80 370 96 L396 160 C410 168 416 180 416 200 L410 300 Z',
    'M86 244 C86 238 90 234 96 234 L114 234 C120 234 124 238 124 244 L124 316 '
      + 'C124 322 120 326 114 326 L96 326 C90 326 86 322 86 316 Z',
    'M396 244 C396 238 400 234 406 234 L424 234 C430 234 434 238 434 244 L434 316 '
      + 'C434 322 430 326 424 326 L406 326 C400 326 396 322 396 316 Z',
    /* Tailpipe */
    'M330 296 C330 290 336 286 344 286 L360 286 C368 286 374 290 374 296 '
      + 'C374 302 368 306 360 306 L344 306 C336 306 330 302 330 296 Z',
  ],
  glass: 'M170 100 L350 100 L368 152 L152 152 Z',
  /* Tail lamps */
  extras: [
    'M120 172 L184 168 L186 200 L122 204 Z',
    'M400 172 L336 168 L334 200 L398 204 Z',
  ],
  /* Boot seam */
  pillars: ['M168 214 L352 214'],
  anchors: {
    lights: [152, 186],
    body: [260, 140],
    tires: [415, 286],
    exhaust: [352, 296],
  },
};

/**
 * Looking down into the engine bay. This is the view the whole split exists
 * for: seven components, each with room to sit where it actually lives.
 */
const CAR_BAY = {
  viewBox: '0 0 560 400',
  masses: [
    'M60 60 C60 48 68 40 82 40 L478 40 C492 40 500 48 500 60 L500 348 '
      + 'C500 360 492 368 478 368 L82 368 C68 368 60 360 60 348 Z',
  ],
  extras: [
    /* Radiator across the front */
    'M92 62 L468 62 L468 100 L92 100 Z',
    /* Battery */
    'M100 122 L192 122 L192 192 L100 192 Z',
    /* Air filter box */
    'M368 122 L470 122 L470 202 L368 202 Z',
    /* Engine block */
    'M208 132 L352 132 L352 284 L208 284 Z',
    /* Aircon compressor */
    'M124 246 C124 232 136 222 152 222 C168 222 180 232 180 246 '
      + 'C180 260 168 270 152 270 C136 270 124 260 124 246 Z',
    /* Fluid reservoirs */
    'M394 236 L446 236 L446 296 L394 296 Z',
    /* Transmission */
    'M222 296 L338 296 L338 352 L222 352 Z',
  ],
  anchors: {
    cooling: [280, 81],
    battery: [146, 157],
    airFilter: [419, 162],
    engine: [280, 200],
    ac: [152, 246],
    fluids: [420, 266],
    transmission: [280, 324],
  },
};

/* A bike head-on is mostly handlebar, lamp and one tyre — narrow, so it gets a
   narrower box rather than being stretched to fill a car-shaped one. */
const MOTO_FRONT = {
  viewBox: '0 0 400 380',
  masses: [
    /* Handlebar, with mirror stalks. The bar alone is just a horizontal slab;
       the mirrors are what make it read as the front of a bike. */
    'M50 76 L350 76 C356 76 358 80 358 86 C358 92 356 96 350 96 L50 96 '
      + 'C44 96 42 92 42 86 C42 80 44 76 50 76 Z',
    'M92 44 L108 44 L108 80 L92 80 Z',
    'M292 44 L308 44 L308 80 L292 80 Z',
    /* Leg shield */
    'M138 182 L262 182 L276 268 L124 268 Z',
    /* Fork legs, flanking the wheel where they can actually be seen */
    'M164 250 L182 250 L182 316 L164 316 Z',
    'M218 250 L236 250 L236 316 L218 316 Z',
    /* Front tyre, edge-on */
    'M182 262 C182 256 188 252 196 252 L204 252 C212 252 218 256 218 262 L218 344 '
      + 'C218 352 212 356 204 356 L196 356 C188 356 182 352 182 344 Z',
  ],
  /* Headlamp cowl */
  extras: [
    'M158 104 C158 96 170 92 200 92 C230 92 242 96 242 104 L250 158 '
      + 'C250 172 232 180 200 180 C168 180 150 172 150 158 Z',
  ],
  anchors: {
    lights: [200, 136],
    cooling: [246, 225],
    suspension: [173, 268],
    brakes: [200, 310],
  },
};

const MOTO_REAR = {
  viewBox: '0 0 400 380',
  masses: [
    /* Seat and tail */
    'M136 100 C136 88 146 80 160 80 L240 80 C254 80 264 88 264 100 L272 178 '
      + 'C272 192 258 200 200 200 C142 200 128 192 128 178 Z',
    /* Swingarm, joining the tail to the wheel */
    'M176 196 L224 196 L224 250 L176 250 Z',
    /* Rear tyre, edge-on */
    'M172 244 C172 236 180 232 190 232 L210 232 C220 232 228 236 228 244 L228 340 '
      + 'C228 350 220 354 210 354 L190 354 C180 354 172 350 172 340 Z',
    /* Muffler, with the pipe that reaches it. Drawn floating clear of the bike
       it reads as an unrelated box parked alongside. */
    'M232 268 L262 262 L262 300 L232 306 Z',
    'M258 254 C258 244 268 238 282 238 L306 238 C320 238 330 244 330 254 L330 306 '
      + 'C330 316 320 322 306 322 L282 322 C268 322 258 316 258 306 Z',
    /* Drive chain run, likewise joined rather than floating */
    'M172 268 L142 262 L142 300 L172 306 Z',
    'M104 258 L146 258 L146 306 L104 306 Z',
  ],
  /* Tail lamp */
  extras: ['M170 124 L230 124 L236 160 L164 160 Z'],
  anchors: {
    fairings: [160, 104],
    lights: [200, 142],
    drive: [124, 282],
    tires: [200, 292],
    exhaust: [294, 280],
  },
};

/**
 * A bike has no engine bay to look down into, so this is the engine and
 * transmission drawn large from the side instead — the same idea as the car's
 * bay view, which is to give the crowded mechanical parts their own canvas.
 */
const MOTO_ENGINE = {
  viewBox: '0 0 520 360',
  masses: [
    /* The case the parts sit in. The car bay view works because an outline
       groups its contents into one machine; without it this view was a
       scattering of unrelated boxes. */
    'M50 50 C50 40 58 32 70 32 L470 32 C482 32 490 40 490 50 L490 314 '
      + 'C490 326 482 334 470 334 L70 334 C58 334 50 326 50 314 Z',
  ],
  extras: [
    /* Cylinder head */
    'M186 74 L296 74 L296 134 L186 134 Z',
    /* Crankcase */
    'M170 134 L312 134 L312 254 L170 254 Z',
    /* CVT case */
    'M314 166 C314 152 326 144 342 144 L400 144 C426 144 442 162 442 186 L442 224 '
      + 'C442 248 426 264 400 264 L342 264 C326 264 314 256 314 242 Z',
    /* Air filter box */
    'M340 62 L452 62 L452 126 L340 126 Z',
    /* Battery */
    'M74 66 L160 66 L160 132 L74 132 Z',
    /* Radiator */
    'M74 168 L160 168 L160 254 L74 254 Z',
    /* Oil sump */
    'M186 254 L296 254 L288 306 L194 306 Z',
  ],
  anchors: {
    battery: [117, 99],
    airFilter: [396, 94],
    engine: [241, 194],
    drive: [386, 204],
    cooling: [117, 211],
    fluids: [241, 280],
  },
};

/* Normalises the loose shape records above into one shape the renderer can
   consume without knowing which view it came from. */
function toShape(record, { viewBox, wheels = [], wheelsBehind = false }) {
  return {
    viewBox,
    masses: record.masses ?? [record.body],
    glass: record.glass ?? null,
    extras: record.extras ?? [],
    pillars: record.pillars ?? record.details ?? [],
    wheels,
    wheelsBehind,
    anchors: record.anchors,
  };
}

function sideShape(bodyType) {
  if (bodyType === 'motorcycle') {
    return toShape(MOTORCYCLE_SIDE, {
      viewBox: SIDE_VIEW_BOX,
      wheels: MOTORCYCLE_SIDE.wheels,
      // A scooter's bodywork covers the top of both wheels. Drawn over the body
      // they look bolted to the outside of it.
      wheelsBehind: true,
    });
  }

  const record = SIDE_SHAPES[bodyType];
  if (!record) return null;

  return toShape(
    { ...record, anchors: carSideAnchors(record.landmarks) },
    { viewBox: SIDE_VIEW_BOX, wheels: record.wheels, wheelsBehind: false },
  );
}

/**
 * Every view available for a vehicle, in the order they are offered.
 *
 * @returns {{id, label, shape}[]} empty when the body type is unknown — see
 *   `hasVehicleShape`.
 */
export function vehicleViews(bodyType) {
  const side = sideShape(bodyType);
  if (!side) return [];

  const motorcycle = bodyType === 'motorcycle';
  const shared = motorcycle
    ? [
      { id: 'front', label: 'Front', record: MOTO_FRONT },
      { id: 'rear', label: 'Rear', record: MOTO_REAR },
      { id: 'engineBay', label: 'Engine', record: MOTO_ENGINE },
    ]
    : [
      { id: 'front', label: 'Front', record: CAR_FRONT },
      { id: 'rear', label: 'Rear', record: CAR_REAR },
      { id: 'engineBay', label: 'Engine bay', record: CAR_BAY },
    ];

  return [
    { id: 'side', label: 'Side', shape: side },
    ...shared.map(({ id, label, record }) => ({
      id,
      label,
      shape: toShape(record, { viewBox: record.viewBox }),
    })),
  ];
}

export function hasVehicleShape(bodyType) {
  return bodyType === 'motorcycle' || Boolean(SIDE_SHAPES[bodyType]);
}
