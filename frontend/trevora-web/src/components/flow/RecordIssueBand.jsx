import React from 'react';
import { Link } from 'react-router-dom';

/**
 * An issue that belongs to the whole record rather than to any one field.
 *
 * <p>Today that means the possible-duplicate warning. It is filed under the
 * synthetic field name {@code duplicate} on purpose — {@code
 * DraftPlausibilityService} notes that filing it under {@code totalCost} would
 * silently overwrite that field's confidence flag — which also means no field
 * badge can ever carry it. Before this band it had nowhere to render at all,
 * and on receipt drafts it was counted but never shown.
 *
 * <p>It sits directly under the bar and above the fields: high enough to be
 * read before any editing starts, and outside the field column because it is
 * not about a value.
 *
 * <p>Dismissing is deliberately local. The warning does not block saving, and
 * there is no endpoint that records "the owner says this is a different
 * service" — inventing one silently would be worse than letting the notice
 * come back on reload.
 */
export default function RecordIssueBand({ issue, vehicleId, onDismiss }) {
  if (!issue) return null;

  return (
    <section className="flow-band">
      <div>
        <p className="flow-band__title">This may already be in your records</p>
        <p className="flow-band__body">{issue.message}</p>
      </div>
      <div className="flow-band__actions">
        {vehicleId && (
          <Link className="flow-btn flow-btn--ghost" to={`/vehicles/${vehicleId}`}>
            See this car&apos;s records
          </Link>
        )}
        <button className="flow-btn flow-btn--ghost" type="button" onClick={onDismiss}>
          It is a different service
        </button>
      </div>
    </section>
  );
}
