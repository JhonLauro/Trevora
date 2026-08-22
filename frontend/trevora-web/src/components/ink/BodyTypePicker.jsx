import React from 'react';
import BodyTypeGlyph from './BodyTypeGlyph.jsx';
import { BODY_TYPES } from '../../data/vehicleCatalog';

/**
 * Body type, answerable without knowing the words.
 *
 * A `<select>` of "Sedan / Hatchback / MPV" assumes the reader knows the
 * terminology, and a lot of owners do not — MPV especially. Each option here
 * shows the shape and three example models, so it can be answered by
 * recognition rather than by vocabulary. The jargon is still shown, because
 * it is what a shop will say.
 *
 * Shape, description and examples all stay. They fail in different ways, so
 * they cover for each other: the silhouette is fastest when it is clear, the
 * description rescues the pairs that look alike at 72px, and the examples
 * settle MPV against van, which neither of the other two reliably does. A
 * screen reader gets nothing from the drawing and reads the description
 * instead.
 *
 * Split into two groups because the first question anyone can answer is "is
 * it a motorcycle or not", and putting the two-wheeler under its own heading
 * means a rider never reads six car descriptions.
 *
 * Real radios, not buttons: this is a single choice inside a form, and radios
 * bring arrow-key navigation and group semantics for free.
 */
const GROUPS = [
  { vehicleClass: 'car', legend: 'Four wheels' },
  { vehicleClass: 'motorcycle', legend: 'Two wheels' },
];

export default function BodyTypePicker({ value, onChange, error, suggested, inputRef }) {
  return (
    <fieldset className="body-picker" aria-describedby={error ? 'body-type-error' : 'body-type-hint'}>
      <legend className="ink-combo__label">Body type</legend>
      <p className="ink-combo__hint" id="body-type-hint">
        {suggested
          ? 'Filled in from the model. Change it if it is wrong.'
          : 'Pick the one that looks like yours — the examples are there if the name is unfamiliar.'}
      </p>

      {GROUPS.map((group) => {
        const options = BODY_TYPES.filter((type) => type.vehicleClass === group.vehicleClass);
        return (
          <div className="body-picker__group" key={group.vehicleClass}>
            <span className="ink-eyebrow">{group.legend}</span>
            <div className="body-picker__options">
              {options.map((type, index) => (
                <label
                  className={`body-picker__option${value === type.id ? ' is-selected' : ''}`}
                  key={type.id}
                >
                  <input
                    type="radio"
                    name="bodyType"
                    value={type.id}
                    checked={value === type.id}
                    ref={group.vehicleClass === 'car' && index === 0 ? inputRef : undefined}
                    onChange={() => onChange(type.id)}
                  />
                  <BodyTypeGlyph bodyType={type.id} />
                  <span className="body-picker__copy">
                    <strong>{type.label}</strong>
                    <small>{type.description}</small>
                    <em>For example: {type.examples}</em>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {error && <p className="ink-combo__error" id="body-type-error">{error}</p>}
    </fieldset>
  );
}
