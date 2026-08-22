import React from 'react';
import { MARKER_RADIUS } from './vehicleShapes';

/**
 * One view of the parts map: a drawing of the vehicle with a numbered marker
 * on each component that lives in this view.
 *
 * **The markers are not keyboard controls, deliberately.** Every one of them
 * duplicates a row in the list below, and making both focusable would put the
 * same controls in the tab order twice — worse for a keyboard or screen-reader
 * user than not having the map at all. So the map is `aria-hidden`, the list
 * stays the accessible path, and the numbers tie the two together: marker 4 is
 * row 4. Pointer users get the map; everyone else loses nothing, because the
 * list already carries every fact the map shows.
 *
 * Numbers are per view and come from the entry's position in `entries`, which
 * the caller has already filtered to this view and sorted by status. They
 * renumber as records change, which is why the number is drawn rather than
 * baked into the geometry.
 *
 * Colour follows the Ink rule: chroma belongs to status and nothing else. The
 * drawing is entirely neutral, so the only coloured things are the markers,
 * and selection is shown by weight and an ink ring rather than by hue.
 */
export default function VehicleDiagram({ shape, entries, selectedKey, onSelect }) {
  if (!shape) return null;

  const wheels = shape.wheels.map(([cx, cy, r]) => (
    <g key={`${cx}-${cy}`}>
      <circle className="vd-tyre" cx={cx} cy={cy} r={r} />
      <circle className="vd-hub" cx={cx} cy={cy} r={r * 0.42} />
    </g>
  ));

  const body = (
    <g key="body">
      {shape.masses.map((d) => <path key={d} className="vd-mass" d={d} />)}
      {shape.extras.map((d) => <path key={d} className="vd-glass" d={d} />)}
      {shape.glass && <path className="vd-glass" d={shape.glass} />}
      {shape.pillars.map((d) => <path key={d} className="vd-line" d={d} />)}
    </g>
  );

  return (
    <div className="vehicle-diagram">
      <svg viewBox={shape.viewBox} aria-hidden="true" focusable="false">
        {shape.wheelsBehind ? [wheels, body] : [body, wheels]}

        {entries.map((entry, index) => {
          const anchor = shape.anchors[entry.key];
          if (!anchor) return null;
          const [x, y] = anchor;
          const selected = entry.key === selectedKey;

          return (
            <g
              key={entry.key}
              className={`vd-marker is-${entry.status}${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(entry.key)}
            >
              <circle cx={x} cy={y} r={MARKER_RADIUS} />
              <text x={x} y={y}>{index + 1}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
