import React from 'react';
import BodyTypePicker from './BodyTypePicker.jsx';
import Combobox from './Combobox.jsx';
import {
  bodyTypeFor,
  bodyTypeForModelAnywhere,
} from '../../data/vehicleCatalog';
import { allMakes } from '../../data/vehicleMakes';
import { MODEL_ALIASES, makeDerivesBodyType, modelsFor } from '../../data/vehicleModels';

/**
 * Make, model and body type — the three fields that have to agree.
 *
 * Shared by the signup step and the in-app Add vehicle page so the two cannot
 * drift apart; the surrounding page owns layout and submission.
 *
 * Body type is filled in from the catalogue the moment a known model is
 * picked, and stays editable. Two reasons it is not hidden when it is
 * derived: the catalogue can be wrong or out of date, and a value the user
 * never saw is a value they can never correct. When the model is not in the
 * catalogue there is nothing to derive from, so the field simply has to be
 * answered.
 */
export function deriveVehicleIdentity(current, changes) {
  const next = { ...current, ...changes };

  if (changes.make !== undefined && changes.make !== current.make) {
    // The old model belonged to the old make. Keeping it would let "Toyota
    // Xpander" through, which is exactly the kind of row the picker exists
    // to prevent.
    const stillValid = modelsFor(next.make).includes(next.model);
    if (!stillValid) {
      next.model = '';
      next.bodyType = '';
      next.bodyTypeAuto = false;
    }
  }

  if (changes.model !== undefined) {
    // Exact make+model first; failing that, the model alone. Someone who
    // typed "Toyata" still typed a real Vios, and a Vios is a sedan whoever
    // spelled the make — so the second lookup rescues the typo case, which is
    // precisely where a stranger to the word "sedan" would otherwise be stuck.
    const derived = bodyTypeFor(next.make, next.model) ?? bodyTypeForModelAnywhere(next.model);
    if (derived) {
      next.bodyType = derived;
      next.bodyTypeAuto = true;
    } else if (current.bodyTypeAuto) {
      // The previous value came from the catalogue, not the user, so it has
      // no claim on a model the catalogue does not recognise.
      next.bodyType = '';
      next.bodyTypeAuto = false;
    }
  }

  if (changes.bodyType !== undefined) {
    next.bodyTypeAuto = false;
  }

  return next;
}

export default function VehicleIdentityFields({ form, errors = {}, onChange, refs = {} }) {
  const makes = allMakes();
  const models = modelsFor(form.make);
  const hasModels = models.length > 0;
  /* Not the same question as "are there models". Most makes now list their
     models without claiming a body type for any of them, and promising that
     picking one fills the body type in would be a promise the catalogue
     cannot keep for a G-Class. */
  const derivesBodyType = makeDerivesBodyType(form.make);

  function update(changes) {
    onChange(deriveVehicleIdentity(form, changes));
  }

  return (
    <>
      {/* Wrapped so make and model can be highlighted together. The pair
          inherits the form's own gap rather than restating it, so the two
          pages that use this component -- signup at 20px, the in-app form at
          22px, both 18px on a phone -- keep the spacing they had. */}
      <div className="veh-identity-pair" data-tip="vehicle-identity">
      <Combobox
        id="vehicle-make"
        label="Make/Brand"
        inputRef={refs.make}
        value={form.make}
        options={makes}
        error={errors.make}
        placeholder="Search brands — Toyota, Honda, Mitsubishi…"
        hint="Start typing to search the list. If your brand is not there, type it anyway."
        emptyHint="Not on the list — it will be saved exactly as you typed it."
        onChange={(value) => update({ make: value })}
      />

      <Combobox
        id="vehicle-model"
        label="Model"
        inputRef={refs.model}
        value={form.model}
        options={models}
        error={errors.model}
        aliases={MODEL_ALIASES}
        placeholder={hasModels ? 'Search models' : 'Type the model'}
        hint={derivesBodyType
          ? 'Picking a listed model fills in the body type for you.'
          : hasModels
            ? 'Pick yours from the list, then choose the body type below.'
            : 'Type the model — this brand has no list yet, and what you type is saved as written.'}
        emptyHint="Not on the list — it will be saved exactly as you typed it."
        onChange={(value) => update({ model: value })}
      />
      </div>

      <BodyTypePicker
        value={form.bodyType}
        suggested={form.bodyTypeAuto}
        error={errors.bodyType}
        inputRef={refs.bodyType}
        onChange={(bodyType) => update({ bodyType })}
      />
    </>
  );
}
