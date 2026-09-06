import React, { useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { patchVehicle } from '../../api/vehicles.js';
import { readVehicleDetails, vehicleWithField } from './VehicleDetailsDialog.jsx';

/**
 * "The receipt printed a plate number your car has no record of."
 *
 * <p>This used to be half of VehicleDetailsDialog, and it interrupted the
 * review screen as a modal. It was the wrong weight in the wrong place. The
 * offer is not about the record being filed at all -- it is an errand about
 * the vehicle profile, arriving on the busiest path in the app, since most
 * receipts print a plate and plenty of vehicles have none on file yet.
 *
 * <p>Nothing was gained by asking early. The values live in the draft's
 * fieldMetadata and survive into the record, so the question keeps. Asking
 * once the record is saved catches somebody who has finished what they came to
 * do and can spend a second on something optional.
 *
 * <p>Its sibling stayed behind, and deliberately: a conflict means the receipt
 * may belong to another car, and that has to be caught before the record is
 * filed rather than after.
 */
export default function VehicleDetailsOffer({ draft, vehicle, onVehicleUpdated }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');

  const { offers } = readVehicleDetails(draft, vehicle);
  const vehicleName = [vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'this vehicle';

  /* Order matters. Adding the values is what makes `offers` empty, so testing
     it before `added` returned null the instant the save succeeded and the
     card simply vanished -- no confirmation, no way to tell it from a click
     that did nothing. The acknowledgement has to win. */
  if (dismissed) return null;
  if (added) {
    return (
      <section className="flow-card vehicle-offer">
        <p className="vehicle-offer__done">{t('veh.addedTo', { vehicle: vehicleName })}</p>
      </section>
    );
  }
  if (offers.length === 0) return null;


  async function addAll() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      let current = vehicle;
      // One request per field, in order, so a failure on the second leaves the
      // first genuinely saved rather than rolling both back invisibly.
      for (const offer of offers) {
        // eslint-disable-next-line no-await-in-loop
        current = await patchVehicle(
          current.vehicleId,
          vehicleWithField(current, offer.field, offer.value),
        );
      }
      onVehicleUpdated?.(current);
      setAdded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flow-card vehicle-offer">
      <span className="flow-eyebrow">{t('veh.fromReceipt')}</span>
        {/* One whole sentence per case, not English grammar spliced in three
            places. "a detail"/"details" and "it"/"them" are agreements neither
            Tagalog nor Cebuano makes, so a template stitched from fragments can
            only come out as English wearing another language's words. */}
      <p className="vehicle-offer__lead">
          {offers.length > 1
            ? t('veh.offerLeadMany', { vehicle: vehicleName })
            : t('veh.offerLeadOne', { vehicle: vehicleName })}
      </p>

      <dl className="vehicle-offer__facts">
        {offers.map((item) => (
          <div className="vehicle-offer__fact" key={item.field}>
            <dt>{t(item.labelKey)}</dt>
            <dd><b className="vehicle-offer__value">{item.value}</b></dd>
          </div>
        ))}
      </dl>

      {error && <p className="vehicle-offer__error" role="alert">{error}</p>}

      <div className="vehicle-offer__actions">
        <button
          className="flow-btn flow-btn--ghost"
          type="button"
          disabled={saving}
          onClick={() => setDismissed(true)}
        >
          {t('action.notNow')}
        </button>
        <button className="flow-btn" type="button" disabled={saving} onClick={addAll}>
          {saving ? t('veh.adding') : offers.length > 1 ? t('veh.addBoth') : t('veh.addIt')}
        </button>
      </div>
    </section>
  );
}
