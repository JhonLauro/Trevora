import React from 'react';
import { ServiceLineEntriesList } from './ServiceLineEntriesEditor';
import { formatPeso, lineEntriesOf } from '../utils/serviceLines';

/**
 * Read-only rendering of a service_record/service_draft's `services` array.
 *
 * <p>Each service shows its own receipt lines when it has them. Before this it
 * showed only `partsReplaced`/`laborPerformed`, which meant a body-and-paint
 * invoice read as one sentence about parts and the eleven consumables it
 * actually billed were nowhere — including on the confirmation screen, one step
 * after the owner had just checked them line by line.
 */
export default function ServiceItemsList({ services, emptyMessage = 'No services recorded for this visit.' }) {
  const items = Array.isArray(services) ? services.filter(Boolean) : [];

  if (!items.length) {
    return <p className="service-items-empty muted">{emptyMessage}</p>;
  }

  return (
    <div className="service-items-list">
      {items.map((item, index) => {
        const lineCost = formatPeso(item.lineCost);
        const entries = lineEntriesOf(item);
        // The legacy summary text is a duplicate of the lines when both exist,
        // so it only earns space on records that predate the lines.
        const showLegacyText = entries.length === 0;

        return (
          <article className="service-item-card" key={item.itemId ?? `service-item-${index}`}>
            <div className="service-item-card-header">
              <h3>{item.serviceType || 'Service'}</h3>
              {item.serviceCategory && <span className="badge subtle">{item.serviceCategory}</span>}
              {lineCost && <span className="service-item-cost">{lineCost}</span>}
            </div>

            <ServiceLineEntriesList item={item} />

            {showLegacyText && item.partsReplaced && (
              <p className="service-item-detail">
                <strong>Parts replaced:</strong> {item.partsReplaced}
              </p>
            )}
            {showLegacyText && item.laborPerformed && (
              <p className="service-item-detail">
                <strong>Labor performed:</strong> {item.laborPerformed}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
