import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n/index.jsx';
import { formatDate } from '../../utils/format';
import { warrantyNotice } from '../../utils/warrantyOffer';

/**
 * "The warranty period on this receipt was added to your vehicle."
 *
 * <p>Shown on the Saved page when confirming the record filled warranty dates the
 * vehicle was missing (ReceiptWarrantyFill on the backend). The dates were
 * written without asking, so this is where the owner is told, with the result
 * rather than a question: the period, whether it has already ended, and a way
 * to the warranty tab.
 *
 * <p>An announcement at the top of the page rather than a toast. A toast that
 * disappears on a timer is gone before somebody reading the record summary looks
 * up, and it is the only place this change is reported.
 */
export default function WarrantyUpdatedNotice({ update, vehicle }) {
  const t = useT();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const notice = warrantyNotice(update, vehicle);
  if (dismissed || !notice || !vehicle?.vehicleId) return null;

  const vehicleName = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'this vehicle';
  const periodText = notice.start && notice.end
    ? t('warranty.limits.timeOnly', { start: formatDate(notice.start), end: formatDate(notice.end) })
    : notice.end
      ? t('warranty.limits.endOnly', { end: formatDate(notice.end) })
      : t('warrantyOffer.startsOn', { start: formatDate(notice.start) });

  return (
    <section className="flow-card vehicle-offer warranty-notice" role="status" aria-live="polite">
      <div className="warranty-notice__head">
        <span className="warranty-notice__icon" aria-hidden="true"><ShieldCheck size={20} /></span>
        <span className="flow-eyebrow">{t('warrantyNotice.eyebrow')}</span>
        <button
          className="warranty-notice__dismiss"
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('warrantyNotice.dismiss')}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <p className="vehicle-offer__lead">{t('warrantyNotice.lead', { vehicle: vehicleName })}</p>
      <p className="warranty-notice__period">{periodText}</p>
      {notice.status && (
        <p className={`warranty-notice__status warranty-notice__status--${notice.status.tone}`}>
          {t(notice.status.key, { date: formatDate(notice.status.date) })}
        </p>
      )}

      <div className="vehicle-offer__actions">
        <button
          className="flow-btn"
          type="button"
          onClick={() => navigate(`/vehicles/${vehicle.vehicleId}?tab=warranty`)}
        >
          {t('warrantyNotice.view')}
        </button>
      </div>
    </section>
  );
}
