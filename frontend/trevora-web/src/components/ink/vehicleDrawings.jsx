import React from 'react';

/**
 * The parts map artwork: nine drawings across two views.
 *
 * Split from `vehicleShapes.js`, which owns the viewBoxes, the marker anchors
 * and which views a body type gets. This file is only the picture.
 *
 * **The value ramp is the whole depth cue.** Ink reserves chroma for status,
 * so nothing here may take colour — if the vehicle is coloured, the markers
 * stop being the only thing on the drawing that means something. Depth comes
 * from six neutral values instead, lightest at the surfaces facing the viewer
 * and darkest in the cavities and the tyres, plus three line weights:
 * silhouette at 3, structural edges at 2–2.5, panel seams and detail at 1.6.
 * Nothing is drawn at a fourth weight.
 *
 * **The drawings stay slightly loose** — soft joins, no shading gradients, no
 * badges or model detail. Component attribution is guessed from receipt
 * keywords and can be wrong, so the map should look like a sketch of your
 * vehicle rather than a technical record of it.
 *
 * Side views face left and say so: every one sits on a ruled ground line with
 * FRONT and REAR labelled at the ends.
 */

/* The neutral ramp. Every value is an Ink token except NEAR, which is the one
   step lighter than --surface that the drawings needed for a surface facing
   the viewer. */
const NEAR = '#faf8f4';
const PANEL = '#efede8'; /* --surface-sunken */
const RECESS = '#e6e1d7'; /* --rule-faint */
const CAVITY = '#d8d1c5'; /* --rule */
const GROUND = '#c4bdb0'; /* --border */
const LINE = '#8b857c'; /* --ink-faint — seams and detail */
const EDGE = '#57534c'; /* --ink-muted — structural edges */
const TYRE = '#33302b'; /* --ink-hover — the darkest value in the set */
const PAPER = '#f7f4ef';

export const WHEEL_ID = 'vd-wheel';
export const BRAKE_ID = 'vd-brake';

/**
 * One wheel, drawn once and reused at scale by every side view, so it cannot
 * drift between body types. Radius 46 at scale 1; a dashed heavy ring stands
 * in for tread blocks, the rim face is two values lighter than the carcass,
 * and the spokes sit off-axis so the wheel does not read as a plus sign.
 */
export function WheelDefs() {
  return (
    <defs>
      <g id={WHEEL_ID}>
        <circle r="46" fill={TYRE} />
        <circle r="40" fill="none" stroke={EDGE} strokeWidth="8" strokeDasharray="6 9" />
        <circle r="27" fill={PANEL} stroke={LINE} strokeWidth="1.5" />
        <path d="M-25 0H25M0 -25V25" stroke={LINE} strokeWidth="3" transform="rotate(20)" />
        <circle r="7" fill={LINE} />
      </g>

      {/* Braking hardware, drawn on the front wheel only. Two identical wheels
          carrying two different markers left the reader to guess why one was
          Brakes and the other Tires; a caliper says which is which without a
          word. Drawn over the rim rather than behind it — a disc hidden behind
          the spokes explains nothing. */}
      <g id={BRAKE_ID}>
        <circle r="30" fill="none" stroke={LINE} strokeWidth="2" strokeDasharray="3 5" />
        <rect x="-41" y="-16" width="18" height="32" rx="6" fill={PANEL} stroke={EDGE} strokeWidth="2.2" />
        <path d="M-37 -6 H-27 M-37 2 H-27" stroke={LINE} strokeWidth="1.6" />
      </g>
    </defs>
  );
}

/**
 * Sedan — three-box, long boot deck, decklid shut line.
 */
export const SEDAN = (
  <>
    <ellipse cx="168" cy="277" rx="52" ry="5" fill={RECESS} />
    <ellipse cx="484" cy="277" rx="52" ry="5" fill={RECESS} />
    <use href={`#${WHEEL_ID}`} transform="translate(168,230)" />
    <use href={`#${WHEEL_ID}`} transform="translate(484,230)" />
    <use href={`#${BRAKE_ID}`} transform="translate(168,230)" />
    <path d="M36 246 L118 246 C118 202 132 176 168 176 C204 176 218 202 218 246 L434 246 C434 202 448 176 484 176 C520 176 534 202 534 246 L604 246 C614 246 618 240 618 230 L618 186 C618 172 612 164 598 161 L470 148 L396 86 C388 79 379 76 366 76 L288 76 C274 76 264 80 256 88 L200 146 L62 158 C44 161 34 172 32 190 L30 220 C30 238 34 246 36 246 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M228 226 L434 226 L434 246 L228 246 Z" fill={RECESS} />
    <path d="M212 142 L262 92 C268 86 276 84 288 84 L366 84 C377 84 384 87 390 93 L452 142 Z" fill={RECESS} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M326 84 L326 142" stroke={EDGE} strokeWidth="3" />
    <path d="M240 150 L236 244 M388 152 L386 244 M470 150 L476 198" stroke={LINE} strokeWidth="1.6" fill="none" />
    <path d="M34 180 L66 176 L68 194 L36 198 Z" fill={RECESS} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M612 178 L588 174 L586 192 L610 196 Z" fill={CAVITY} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M32 208 L62 205 L62 218 L34 220 Z" fill={CAVITY} />
    <rect x="590" y="248" width="22" height="9" rx="4.5" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M10 278 H630" stroke={GROUND} strokeWidth="1.5" />
    <text x="12" y="294" className="vd-label">FRONT</text>
    <text x="628" y="294" textAnchor="end" className="vd-label">REAR</text>
  </>
);

/**
 * Hatchback — two-box, glass to the bumper, short rear overhang. It is 112
 * units shorter than the sedan, and that proportion separates the two at
 * panel size more reliably than the outline does.
 */
export const HATCHBACK = (
  <>
    <ellipse cx="208" cy="273" rx="52" ry="5" fill={RECESS} />
    <ellipse cx="486" cy="273" rx="52" ry="5" fill={RECESS} />
    <use href={`#${WHEEL_ID}`} transform="translate(208,226)" />
    <use href={`#${WHEEL_ID}`} transform="translate(486,226)" />
    <use href={`#${BRAKE_ID}`} transform="translate(208,226)" />
    <path d="M114 242 L158 242 C158 198 172 172 208 172 C244 172 258 198 258 242 L436 242 C436 198 450 172 486 172 C522 172 536 198 536 242 L566 242 C578 242 584 234 584 222 L584 146 C584 136 580 129 572 123 L460 82 C452 77 444 74 432 74 L336 74 C322 74 312 78 304 86 L254 142 L140 154 C122 157 112 168 110 186 L108 214 C108 234 112 242 114 242 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M268 222 L436 222 L436 242 L268 242 Z" fill={RECESS} />
    <path d="M266 138 L306 90 C312 84 320 82 332 82 L428 82 C438 82 445 85 451 90 L534 124 L534 138 Z" fill={RECESS} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M362 82 L362 138 M452 92 L452 138" stroke={EDGE} strokeWidth="3" />
    <path d="M288 146 L284 240 M434 148 L432 240 M540 122 C556 152 566 190 568 228" stroke={LINE} strokeWidth="1.6" fill="none" />
    <path d="M112 186 L144 182 L146 200 L114 204 Z" fill={RECESS} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M578 168 L554 164 L552 184 L576 188 Z" fill={CAVITY} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M110 212 L140 209 L140 222 L112 224 Z" fill={CAVITY} />
    <rect x="552" y="244" width="22" height="9" rx="4.5" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M10 274 H630" stroke={GROUND} strokeWidth="1.5" />
    <text x="12" y="290" className="vd-label">FRONT</text>
    <text x="628" y="290" textAnchor="end" className="vd-label">REAR</text>
  </>
);

/**
 * SUV or crossover — roof rails, upright tailgate, the biggest wheels of the
 * set and visible ride height.
 */
export const SUV = (
  <>
    <ellipse cx="176" cy="309" rx="60" ry="5" fill={RECESS} />
    <ellipse cx="482" cy="309" rx="60" ry="5" fill={RECESS} />
    <use href={`#${WHEEL_ID}`} transform="translate(176,254) scale(1.174)" />
    <use href={`#${WHEEL_ID}`} transform="translate(482,254) scale(1.174)" />
    <use href={`#${BRAKE_ID}`} transform="translate(176,254) scale(1.174)" />
    <path d="M40 250 L118 250 C118 200 132 186 176 186 C220 186 234 200 234 250 L424 250 C424 200 438 186 482 186 C526 186 540 200 540 250 L600 250 C612 250 618 242 618 230 L618 120 C618 106 612 98 600 94 L560 78 L280 62 C266 61 256 66 250 76 L210 138 L66 152 C48 155 38 166 36 184 L34 222 C34 244 38 250 40 250 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M244 228 L424 228 L424 250 L244 250 Z" fill={RECESS} />
    <path d="M222 134 L256 84 C260 76 268 72 280 72 L556 86 L556 134 Z" fill={RECESS} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M330 78 L330 134 M420 82 L420 134 M500 86 L500 134" stroke={EDGE} strokeWidth="3" />
    <path d="M286 56 L556 70" stroke={EDGE} strokeWidth="5" strokeLinecap="round" />
    <path d="M256 142 L252 248 M408 148 L406 248 M560 96 L600 100" stroke={LINE} strokeWidth="1.6" fill="none" />
    <path d="M38 176 L74 172 L76 192 L40 196 Z" fill={RECESS} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M612 148 L586 144 L584 168 L610 172 Z" fill={CAVITY} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M36 208 L70 205 L70 222 L38 224 Z" fill={CAVITY} />
    <rect x="588" y="252" width="24" height="10" rx="5" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M10 310 H630" stroke={GROUND} strokeWidth="1.5" />
    <text x="12" y="328" className="vd-label">FRONT</text>
    <text x="628" y="328" textAnchor="end" className="vd-label">REAR</text>
  </>
);

/**
 * MPV — one box: a deeply raked screen off a short bonnet, and a sliding
 * door track along the flank.
 */
export const MPV = (
  <>
    <ellipse cx="180" cy="315" rx="54" ry="5" fill={RECESS} />
    <ellipse cx="480" cy="315" rx="54" ry="5" fill={RECESS} />
    <use href={`#${WHEEL_ID}`} transform="translate(180,266) scale(1.043)" />
    <use href={`#${WHEEL_ID}`} transform="translate(480,266) scale(1.043)" />
    <use href={`#${BRAKE_ID}`} transform="translate(180,266) scale(1.043)" />
    <path d="M34 258 L126 258 C126 214 140 200 180 200 C220 200 234 214 234 258 L426 258 C426 214 440 200 480 200 C520 200 534 214 534 258 L602 258 C614 258 620 250 620 238 L620 118 C620 104 614 96 602 92 L562 76 L300 62 C286 61 276 64 268 72 L200 146 L62 158 C44 161 34 172 32 190 L30 230 C30 252 34 258 34 258 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M244 236 L426 236 L426 258 L244 258 Z" fill={RECESS} />
    <path d="M212 142 L272 76 C276 70 284 68 296 69 L558 88 L558 142 Z" fill={RECESS} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M340 74 L340 142 M436 81 L436 142 M508 86 L508 142" stroke={EDGE} strokeWidth="3" />
    <path d="M300 200 L520 204 M300 150 L296 256 M430 156 L428 256" stroke={LINE} strokeWidth="1.6" fill="none" />
    <path d="M32 184 L70 180 L72 200 L34 204 Z" fill={RECESS} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M614 152 L588 148 L586 174 L612 178 Z" fill={CAVITY} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M30 216 L64 213 L64 230 L32 232 Z" fill={CAVITY} />
    <rect x="590" y="260" width="22" height="9" rx="4.5" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M10 316 H630" stroke={GROUND} strokeWidth="1.5" />
    <text x="12" y="334" className="vd-label">FRONT</text>
    <text x="628" y="334" textAnchor="end" className="vd-label">REAR</text>
  </>
);

/**
 * Pickup — the cab ends at x=392 and the bed is open behind it, with a rail
 * and a tailgate seam. Long rear wheelbase.
 */
export const PICKUP = (
  <>
    <ellipse cx="160" cy="289" rx="58" ry="5" fill={RECESS} />
    <ellipse cx="498" cy="289" rx="58" ry="5" fill={RECESS} />
    <use href={`#${WHEEL_ID}`} transform="translate(160,236) scale(1.13)" />
    <use href={`#${WHEEL_ID}`} transform="translate(498,236) scale(1.13)" />
    <use href={`#${BRAKE_ID}`} transform="translate(160,236) scale(1.13)" />
    <path d="M28 234 L104 234 C104 190 118 172 160 172 C202 172 216 190 216 234 L442 234 C442 190 456 172 498 172 C540 172 554 190 554 234 L610 234 C620 234 624 228 624 218 L624 130 L392 130 L392 78 C392 68 386 64 376 64 L280 64 C268 64 258 68 252 78 L198 132 L58 146 C40 149 30 160 28 178 L26 210 C26 228 28 234 28 234 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M226 212 L442 212 L442 234 L226 234 Z" fill={RECESS} />
    <path d="M210 126 L252 82 C256 74 264 70 276 70 L376 70 L376 126 Z" fill={RECESS} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M318 70 L318 126" stroke={EDGE} strokeWidth="3" />
    <path d="M400 140 L610 140 M612 134 L612 230 M240 134 L236 230" stroke={LINE} strokeWidth="1.6" fill="none" />
    <path d="M26 176 L62 172 L64 190 L28 194 Z" fill={RECESS} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M620 148 L598 145 L596 166 L618 169 Z" fill={CAVITY} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M26 204 L58 201 L58 216 L28 218 Z" fill={CAVITY} />
    <rect x="592" y="236" width="24" height="10" rx="5" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M10 290 H630" stroke={GROUND} strokeWidth="1.5" />
    <text x="12" y="308" className="vd-label">FRONT</text>
    <text x="628" y="308" textAnchor="end" className="vd-label">REAR</text>
  </>
);

/**
 * Van — a tall box, glazed at the cab only, blank cargo panels with a
 * sliding door track.
 */
export const VAN = (
  <>
    <ellipse cx="160" cy="337" rx="56" ry="5" fill={RECESS} />
    <ellipse cx="496" cy="337" rx="56" ry="5" fill={RECESS} />
    <use href={`#${WHEEL_ID}`} transform="translate(160,286) scale(1.087)" />
    <use href={`#${WHEEL_ID}`} transform="translate(496,286) scale(1.087)" />
    <use href={`#${BRAKE_ID}`} transform="translate(160,286) scale(1.087)" />
    <path d="M30 282 L104 282 C104 238 118 220 160 220 C202 220 216 238 216 282 L440 282 C440 238 454 220 496 220 C538 220 552 238 552 282 L608 282 C620 282 626 274 626 262 L626 84 C626 70 618 62 604 60 L268 44 C252 43 242 48 236 60 L196 148 L58 162 C40 165 30 176 28 194 L26 250 C26 276 30 282 30 282 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M226 260 L440 260 L440 282 L226 282 Z" fill={RECESS} />
    <path d="M206 144 L240 68 C244 60 252 56 264 57 L340 62 L340 144 Z" fill={RECESS} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M356 152 L600 156 M348 62 L344 278 M470 68 L468 278 M614 70 L614 278" stroke={LINE} strokeWidth="1.6" fill="none" />
    <path d="M28 210 L66 206 L68 228 L30 232 Z" fill={RECESS} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M620 190 L594 187 L592 214 L618 217 Z" fill={CAVITY} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M28 244 L60 241 L60 258 L30 260 Z" fill={CAVITY} />
    <rect x="592" y="284" width="22" height="9" rx="4.5" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M10 338 H630" stroke={GROUND} strokeWidth="1.5" />
    <text x="12" y="356" className="vd-label">FRONT</text>
    <text x="628" y="356" textAnchor="end" className="vd-label">REAR</text>
  </>
);

/**
 * Motorcycle — a generic naked standard: exposed frame and engine, upright
 * bars, no leg shield and no step-through.
 *
 * Deliberately not a scooter, and deliberately not three sub-type drawings.
 * `bodyType` records `motorcycle`, not underbone or big bike, so a sub-type
 * drawing would be a guess dressed as a fact — the same failure as
 * substituting a default silhouette for an unknown body type. A naked bike
 * claims nothing that a scooter drawing claims.
 */
export const MOTORCYCLE = (
  <>
    <ellipse cx="150" cy="315" rx="60" ry="5" fill={RECESS} />
    <ellipse cx="482" cy="315" rx="60" ry="5" fill={RECESS} />
    <path d="M292 234 C278 264 300 286 338 292 L470 298" fill="none" stroke={LINE} strokeWidth="11" strokeLinecap="round" />
    <path d="M462 284 L534 278 C548 277 554 284 554 294 L554 304 C554 314 547 319 534 317 L462 308 Z" fill={PANEL} stroke={EDGE} strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M400 232 L482 256" stroke={EDGE} strokeWidth="13" strokeLinecap="round" />
    <path d="M396 196 L434 232" stroke={EDGE} strokeWidth="9" strokeLinecap="round" />
    <use href={`#${WHEEL_ID}`} transform="translate(150,256) scale(1.26)" />
    <use href={`#${WHEEL_ID}`} transform="translate(482,256) scale(1.26)" />
    <circle cx="150" cy="256" r="34" fill="none" stroke={LINE} strokeWidth="3" />
    <circle cx="482" cy="256" r="27" fill="none" stroke={LINE} strokeWidth="3" />
    <path d="M408 242 L478 258" stroke={EDGE} strokeWidth="4" strokeDasharray="5 4" />
    <path d="M150 256 L236 138" stroke={EDGE} strokeWidth="11" strokeLinecap="round" />
    <path d="M150 256 L194 196" stroke={EDGE} strokeWidth="19" strokeLinecap="round" />
    <path d="M108 198 C132 180 174 178 198 192 L192 208 C172 197 136 199 118 210 Z" fill={PANEL} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M216 124 L288 114" stroke={EDGE} strokeWidth="7" strokeLinecap="round" />
    <path d="M228 128 L246 148" stroke={EDGE} strokeWidth="12" strokeLinecap="round" />
    <circle cx="206" cy="150" r="25" fill={RECESS} stroke={EDGE} strokeWidth="3" />
    <path d="M240 148 L286 174 L336 188 L394 202 M238 146 L286 206" stroke={EDGE} strokeWidth="8" strokeLinecap="round" />
    <path d="M262 170 C268 148 288 136 316 134 L374 132 C388 132 394 142 392 154 L388 178 L280 186 C266 186 258 180 262 170 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M266 158 C286 148 340 144 386 148" fill="none" stroke={LINE} strokeWidth="1.6" />
    <path d="M386 152 L456 146 C470 145 478 150 478 158 L478 166 L392 176 Z" fill={PANEL} stroke={EDGE} strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M470 144 L522 136 C534 134 540 141 538 152 L482 162 Z" fill={NEAR} stroke={EDGE} strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M252 192 L286 188 L292 248 L258 252 Z" fill={CAVITY} stroke={EDGE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M259 194 L264 250 M268 193 L273 249 M277 192 L282 248" stroke={LINE} strokeWidth="1.8" />
    <path d="M286 184 L358 180 L360 192 L288 196 Z" fill={RECESS} stroke={EDGE} strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M288 194 L358 190 L362 228 L292 232 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M290 202 L360 198 M291 210 L361 206 M292 218 L362 214" stroke={LINE} strokeWidth="1.8" />
    <path d="M292 228 L396 220 C408 219 414 227 414 239 L412 258 C410 270 402 276 390 276 L308 272 C296 271 290 264 290 252 Z" fill={PANEL} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <circle cx="372" cy="246" r="24" fill={PAPER} stroke={LINE} strokeWidth="2" />
    <path d="M10 316 H630" stroke={GROUND} strokeWidth="1.5" />
    <text x="12" y="334" className="vd-label">FRONT</text>
    <text x="628" y="334" textAnchor="end" className="vd-label">REAR</text>
  </>
);

/**
 * Under the bonnet, shared by all six car body types: looking straight down
 * into an open bay, front of the vehicle at the top.
 *
 * The components overlap and sit at different depths rather than tiling a
 * grid, they carry the shapes people recognise (a finned radiator, a bladed
 * fan, a ribbed cam cover), and the inner fenders frame the bay in the
 * darkest value so the middle sits inside something. That is what stops it
 * reading as a wireframe.
 */
export const CAR_BAY = (
  <>
    <text x="320" y="26" textAnchor="middle" className="vd-label">FRONT OF VEHICLE</text>
    <rect x="40" y="40" width="560" height="350" rx="14" fill={PANEL} stroke={EDGE} strokeWidth="3" />
    <path d="M40 54 L96 54 L96 376 L40 376 Z M600 54 L544 54 L544 376 L600 376 Z" fill={CAVITY} />
    <rect x="96" y="48" width="448" height="46" fill={NEAR} stroke={LINE} strokeWidth="2" />
    <path d="M106 72 H534" stroke={LINE} strokeWidth="40" strokeDasharray="3 13" />
    <circle cx="320" cy="140" r="48" fill={PAPER} stroke={EDGE} strokeWidth="2.5" />
    <path d="M320 96 C298 116 298 164 320 184 M364 140 C344 118 296 118 276 140 M352 172 C338 148 302 132 288 108 M288 172 C302 148 338 132 352 108" fill="none" stroke={LINE} strokeWidth="2" />
    <circle cx="320" cy="140" r="13" fill={RECESS} stroke={LINE} strokeWidth="2" />
    <rect x="196" y="186" width="252" height="162" rx="14" fill={RECESS} stroke={LINE} strokeWidth="2" />
    <rect x="214" y="196" width="216" height="134" rx="12" fill={NEAR} stroke={EDGE} strokeWidth="3" />
    <path d="M226 236 H418 M226 262 H418 M226 288 H418" stroke={LINE} strokeWidth="1.6" />
    <circle cx="250" cy="216" r="13" fill={PANEL} stroke={EDGE} strokeWidth="2" />
    <path d="M242 216 H258" stroke={EDGE} strokeWidth="2" />
    <path d="M258 330 L392 330 L410 386 C412 394 406 398 398 398 L252 398 C244 398 238 394 240 386 Z" fill={PANEL} stroke={EDGE} strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M254 348 C290 340 358 340 396 348 M250 368 C290 358 362 358 402 368" fill="none" stroke={LINE} strokeWidth="1.6" />
    <rect x="74" y="214" width="104" height="86" rx="6" fill={NEAR} stroke={EDGE} strokeWidth="3" />
    <circle cx="96" cy="226" r="8" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <circle cx="156" cy="226" r="8" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M74 252 H178 M74 274 H178" stroke={LINE} strokeWidth="1.6" />
    <rect x="470" y="178" width="114" height="90" rx="12" fill={NEAR} stroke={EDGE} strokeWidth="3" />
    <path d="M470 224 C452 224 448 240 436 248" fill="none" stroke={LINE} strokeWidth="17" />
    <path d="M470 224 C452 224 448 240 436 248" fill="none" stroke={PANEL} strokeWidth="13" />
    <path d="M470 224 C452 224 448 240 436 248" fill="none" stroke={LINE} strokeWidth="13" strokeDasharray="2 6" />
    <rect x="470" y="96" width="72" height="68" rx="8" fill={PAPER} stroke={LINE} strokeWidth="2" />
    <circle cx="506" cy="96" r="11" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M470 138 H542" stroke={LINE} strokeWidth="1.6" />
    <rect x="96" y="318" width="62" height="62" rx="8" fill={PAPER} stroke={LINE} strokeWidth="2" />
    <circle cx="127" cy="318" r="10" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <rect x="150" y="330" width="66" height="62" rx="24" fill={PANEL} stroke={EDGE} strokeWidth="2.5" />
    <circle cx="183" cy="346" r="17" fill={PAPER} stroke={EDGE} strokeWidth="2" />
    <circle cx="183" cy="346" r="6" fill={LINE} />
    <path d="M300 94 C300 130 268 150 240 156 M400 94 C400 128 428 148 452 160" fill="none" stroke={LINE} strokeWidth="7" />
    <text x="320" y="418" textAnchor="middle" className="vd-label">BULKHEAD</text>
  </>
);

/**
 * Engine and frame, motorcycles. A bike has no bay to look down into, so this
 * is a left-side close-up of the same crowded region instead.
 *
 * **The parts are carried by something.** The first version drew them floating
 * — the battery sat past the end of the frame joined only by a hose, the
 * radiator touched nothing, and the tubes ran off into space. The car bay
 * reads as a place because its tray encloses everything; a side-on close-up
 * cannot have a tray, so the equivalent here is a frame that visibly holds
 * each part, a ground line, and the inner edge of both wheels at the margins.
 * The wheels do most of the work: they say "this is the middle of a
 * motorcycle" faster than any label.
 */
export const MOTORCYCLE_BAY = (
  <>
    <text x="320" y="26" textAnchor="middle" className="vd-label">LEFT SIDE</text>

    {/* Both wheels, mostly out of frame. Scale and orientation in one stroke. */}
    <circle cx="-26" cy="300" r="104" fill={PAPER} stroke={CAVITY} strokeWidth="3" />
    <circle cx="666" cy="300" r="104" fill={PAPER} stroke={CAVITY} strokeWidth="3" />
    <ellipse cx="60" cy="406" rx="46" ry="4" fill={RECESS} />
    <ellipse cx="580" cy="406" rx="46" ry="4" fill={RECESS} />

    {/* Frame: headstock, main spar, cradle under the engine, subframe out the
        back. Everything else hangs off one of these. */}
    <path d="M110 132 L120 174" stroke={EDGE} strokeWidth="19" strokeLinecap="round" />
    <path d="M110 156 L436 176" stroke={EDGE} strokeWidth="13" strokeLinecap="round" />
    <path d="M112 162 L176 300 L268 348 L392 352" stroke={EDGE} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M430 178 L544 164" stroke={EDGE} strokeWidth="11" strokeLinecap="round" />
    <path d="M432 182 L470 246" stroke={EDGE} strokeWidth="9" strokeLinecap="round" />

    {/* Radiator, bolted to the down-tube */}
    <path d="M96 196 L168 186 L180 326 L108 336 Z" fill={CAVITY} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M110 200 L118 330 M124 198 L132 328 M138 196 L146 326 M152 194 L160 324" stroke={LINE} strokeWidth="1.8" />
    <path d="M168 224 C190 220 200 228 212 242" fill="none" stroke={LINE} strokeWidth="10" strokeLinecap="round" />

    {/* Airbox, sitting in the spine of the frame */}
    <rect x="248" y="98" width="180" height="74" rx="14" fill={NEAR} stroke={EDGE} strokeWidth="3" />
    <path d="M248 136 H428" stroke={LINE} strokeWidth="1.6" />
    <path d="M300 172 C302 190 306 200 312 210" fill="none" stroke={LINE} strokeWidth="14" />
    <path d="M300 172 C302 190 306 200 312 210" fill="none" stroke={PANEL} strokeWidth="10" />

    {/* Battery, strapped inside the subframe triangle rather than beyond it */}
    <rect x="440" y="168" width="112" height="80" rx="6" fill={NEAR} stroke={EDGE} strokeWidth="3" />
    <circle cx="459" cy="180" r="8" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <circle cx="533" cy="180" r="8" fill={CAVITY} stroke={EDGE} strokeWidth="2" />
    <path d="M440 202 H552 M440 226 H552" stroke={LINE} strokeWidth="1.6" />
    <path d="M436 232 C416 240 406 248 398 260" fill="none" stroke={LINE} strokeWidth="7" />

    {/* Cylinder and head, then the crankcase under it */}
    <path d="M214 200 L370 188 L374 214 L218 226 Z" fill={RECESS} stroke={EDGE} strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M218 222 L374 210 L386 284 L232 296 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <path d="M222 238 L377 226 M224 252 L379 240 M226 266 L381 254" stroke={LINE} strokeWidth="2" />
    <path d="M234 288 L388 278 C414 276 430 292 432 318 L434 344 C436 370 420 386 394 388 L276 392 C250 394 234 380 232 356 L228 316 C226 298 224 290 234 288 Z" fill={NEAR} stroke={EDGE} strokeWidth="3" strokeLinejoin="round" />
    <circle cx="372" cy="336" r="44" fill={PANEL} stroke={EDGE} strokeWidth="2.5" />
    <circle cx="372" cy="336" r="28" fill="none" stroke={LINE} strokeWidth="1.8" />

    {/* Sump plug */}
    <circle cx="268" cy="362" r="18" fill={PAPER} stroke={EDGE} strokeWidth="2.5" />
    <path d="M256 362 H280" stroke={EDGE} strokeWidth="2" />

    {/* Header, leaving the head and running back under the cases */}
    <path d="M212 232 C186 260 184 320 214 356 C246 394 330 404 412 396" fill="none" stroke={LINE} strokeWidth="11" strokeLinecap="round" />

    <path d="M10 408 H630" stroke={GROUND} strokeWidth="1.5" />
    <text x="12" y="424" className="vd-label">FRONT</text>
    <text x="628" y="424" textAnchor="end" className="vd-label">REAR</text>
  </>
);
