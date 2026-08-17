import React from 'react';

function formatLineCost(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `PHP ${number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Read-only rendering of a service_record/service_draft's `services` array as a list of cards,
 * each showing serviceType as a mini-heading with partsReplaced/laborPerformed/lineCost beneath.
 */
export default function ServiceItemsList({ services, emptyMessage = 'No services recorded for this visit.' }) {
  const items = Array.isArray(services) ? services.filter(Boolean) : [];

  if (!items.length) {
    return <p className="service-items-empty muted">{emptyMessage}</p>;
  }

  return (
    <div className="service-items-list">
      {items.map((item, index) => {
        const lineCost = formatLineCost(item.lineCost);
        return (
          <article className="service-item-card" key={item.itemId ?? `service-item-${index}`}>
            <div className="service-item-card-header">
              <h3>{item.serviceType || 'Service'}</h3>
              {item.serviceCategory && <span className="badge subtle">{item.serviceCategory}</span>}
              {lineCost && <span className="service-item-cost">{lineCost}</span>}
            </div>
            {item.partsReplaced && (
              <p className="service-item-detail">
                <strong>Parts replaced:</strong> {item.partsReplaced}
              </p>
            )}
            {item.laborPerformed && (
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
