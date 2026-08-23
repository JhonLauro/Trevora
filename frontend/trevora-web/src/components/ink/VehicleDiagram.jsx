import React from 'react';
import { MARKER_RADIUS } from './vehicleShapes';
import { WheelDefs } from './vehicleDrawings.jsx';

/* Selection and hover are drawn as a ring *outside* the marker, at these
   radii, rather than by thickening the marker's own stroke. The stroke is
   already carrying status — solid for documented, dashed for not — so putting
   selection there too makes a selected undocumented marker stop looking
   undocumented. Kept on separate channels, both survive. */
const HOVER_HALO = 18;
const SELECTED_HALO = 20;

/**
 * One view of the parts map: a drawing of the vehicle with a numbered marker
 * on each component that lives in this view.
 *
 * **The markers are not keyboard controls, deliberately.** Every one of them
 * duplicates a row in the list below, and making both focusable would put the
 * same controls in the tab order twice — worse for a keyboard or screen-reader
 * user than not having the map at all. So the map is `aria-hidden`, the list
 * stays the accessible path, and the numbers tie the two together: marker 5 is
 * the row numbered 5.
 *
 * Numbers are the component's position in its class taxonomy, not its position
 * in this view, so they do not change when the tab changes or when records
 * come in. On a car the side view therefore reads 1–6 and the bonnet 7–13.
 *
 * Colour follows the Ink rule: chroma belongs to status and nothing else. The
 * drawing is entirely neutral, so the only coloured thing on it is a filled
 * marker.
 */
export default function VehicleDiagram({ shape, entries, selectedKey, hoverKey, onSelect, onHover }) {
  if (!shape) return null;

  return (
    <div className="vehicle-diagram">
      <svg viewBox={shape.viewBox} aria-hidden="true" focusable="false">
        <WheelDefs />
        {shape.art}

        {entries.map((entry) => {
          const anchor = shape.anchors[entry.key];
          if (!anchor) return null;
          const [x, y] = anchor;
          const selected = entry.key === selectedKey;
          const hovered = !selected && entry.key === hoverKey;

          return (
            <g
              key={entry.key}
              className={`vd-marker is-${entry.status}${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(entry.key)}
              onMouseEnter={() => onHover?.(entry.key)}
              onMouseLeave={() => onHover?.(null)}
            >
              {(selected || hovered) && (
                <circle
                  className="vd-marker__halo"
                  cx={x}
                  cy={y}
                  r={selected ? SELECTED_HALO : HOVER_HALO}
                />
              )}
              {/* An opaque disc a little larger than the marker. The dot is
                  already opaque, but the "no record" dash reads at the same
                  visual frequency as wheel spokes and tread and dissolves into
                  them; this gives every marker its own ground regardless of
                  what it sits on. */}
              <circle
                className="vd-marker__moat"
                cx={x}
                cy={y}
                r={(selected ? MARKER_RADIUS + 2 : MARKER_RADIUS + (hovered ? 1 : 0)) + 3}
              />
              <circle
                className="vd-marker__dot"
                cx={x}
                cy={y}
                r={selected ? MARKER_RADIUS + 2 : MARKER_RADIUS + (hovered ? 1 : 0)}
              />
              <text x={x} y={y}>{entry.number}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
