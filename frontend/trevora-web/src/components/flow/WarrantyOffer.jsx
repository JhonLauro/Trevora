import React, { useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { patchVehicle } from '../../api/vehicles.js';
import { formatDate } from '../../utils/format';
import { readWarrantyOffer, warrantyOfferPatch } from '../../utils/warrantyOffer';

/**
 * "The receipt prints a warranty period."
 *
 * <p>The plate and VIN offer's sibling, on the same screen for the same reason:
 * it is an errand about the vehicle profile, asked once the record is saved.
 *
 * <p>A disagreement is a card here, not the review page's blocking dialog. A
 * different plate suggests another car; different warranty dates suggest a typo
 * or an extended warranty, and neither is worth stopping a record over. The
 * vehicle's dates stay unless the owner picks the receipt's.
 */
function period(t, start, end) {
  if (start && end) {
    return t('warranty.limits.timeOnly', { start: formatDate(start), end: formatDate(end) });
  }
  if (end) return t('warranty.limits.endOnly', { end: formatDate(end) });
  return t('warrantyOffer.startsOn', { start: formatDate(start) });
}

export default function WarrantyOffer({ draft, vehicle, onVehicleUpdated }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const offer = readWarrantyOffer(draft, vehicle);
  const vehicleName = [vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'this vehicle';

  // The acknowledgement wins over the empty offer, for the reason given in
  // VehicleDetailsOffer: saving is what makes the offer disappear.
  if (dismissed) return null;
  if (done) {
    return (
      <section className="flow-card vehicle-offer">
        <p className="vehicle-offer__done">{t('warrantyOffer.done', { vehicle: vehicleName })}</p>
      </section>
    );
  }
  if (!offer) return null;

  const conflict = offer.kind === 'conflict';

  async function accept() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const updated = await patchVehicle(vehicle.vehicleId, warrantyOfferPatch(offer));
      onVehicleUpdated?.(updated);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flow-card vehicle-offer">
      <span className="flow-eyebrow">{t('veh.fromReceipt')}</span>
      <p className="vehicle-offer__lead">
        {conflict
          ? t('warrantyOffer.conflictLead', { vehicle: vehicleName })
          : t('warrantyOffer.offerLead', { vehicle: vehicleName })}
      </p>

      <dl className="vehicle-offer__facts">
        <div className="vehicle-offer__fact">
          <dt>{t('warrantyOffer.receiptSays')}</dt>
          <dd><b className="vehicle-offer__value">{period(t, offer.start, offer.end)}</b></dd>
        </div>
        {conflict && (
          <div className="vehicle-offer__fact">
            <dt>{t('warrantyOffer.vehicleHas')}</dt>
            <dd><b className="vehicle-offer__value">{period(t, offer.recordedStart, offer.recordedEnd)}</b></dd>
          </div>
        )}
      </dl>

      {error && <p className="vehicle-offer__error" role="alert">{error}</p>}

      <div className="vehicle-offer__actions">
        <button
          className="flow-btn flow-btn--ghost"
          type="button"
          disabled={saving}
          onClick={() => setDismissed(true)}
        >
          {conflict ? t('warrantyOffer.keepMine') : t('action.notNow')}
        </button>
        <button className="flow-btn" type="button" disabled={saving} onClick={accept}>
          {saving ? t('veh.adding') : conflict ? t('warrantyOffer.useReceipts') : t('veh.addIt')}
        </button>
      </div>
    </section>
  );
}
