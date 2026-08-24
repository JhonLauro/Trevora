import React from 'react';
import ServiceLineEntriesEditor from './ServiceLineEntriesEditor';
import { formatPeso, lineEntriesOf } from '../utils/serviceLines';

function emptyRow(sortOrder = 0) {
  return {
    itemId: null,
    serviceType: '',
    serviceCategory: '',
    partsReplaced: '',
    laborPerformed: '',
    lineCost: '',
    lineEntries: [],
    sortOrder,
  };
}

/**
 * Repeatable editor for a service_draft/service_record's `services` array.
 *
 * <p>Each service holds the receipt's own lines — see
 * {@link ServiceLineEntriesEditor} — which are the authoritative breakdown of
 * what was charged. `partsReplaced` and `laborPerformed` are the pre-011
 * free-text buckets: still written, because classification and component
 * evidence read them, but no longer the thing an owner is asked to fill in.
 * They sit behind a disclosure, and only open by default where a value already
 * exists, so old records stay editable without inviting new ones.
 *
 * <p>Controlled component: `value` is the array of service items, `onChange`
 * receives the next array on every edit.
 */
export default function ServiceItemsEditor({ value, onChange }) {
  const items = Array.isArray(value) && value.length > 0 ? value : [emptyRow(0)];

  function updateRow(index, patch) {
    onChange(items.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function fieldHandler(index, field) {
    return (event) => updateRow(index, { [field]: event.target.value });
  }

  function addRow() {
    onChange([...items, emptyRow(items.length)]);
  }

  function removeRow(index) {
    const next = items.filter((_, rowIndex) => rowIndex !== index).map((row, rowIndex) => ({ ...row, sortOrder: rowIndex }));
    onChange(next.length ? next : [emptyRow(0)]);
  }

  return (
    <div className="service-items-editor">
      {items.map((row, index) => {
        const entries = lineEntriesOf(row);
        const hasLegacyText = Boolean(String(row.partsReplaced ?? '').trim() || String(row.laborPerformed ?? '').trim());
        const subtotal = formatPeso(
          entries.reduce((sum, entry) => sum + (Number(entry.lineTotal) || 0), 0),
        );

        return (
          <div className="service-item-row" key={row.itemId ?? `service-item-new-${index}`}>
            <div className="service-item-row-header">
              <span>{items.length > 1 ? `Service ${index + 1}` : 'Service'}</span>
              {items.length > 1 && (
                <button
                  type="button"
                  className="service-item-remove"
                  onClick={() => removeRow(index)}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="form-grid">
              <label>
                What was done
                <input
                  value={row.serviceType ?? ''}
                  onChange={fieldHandler(index, 'serviceType')}
                  placeholder="Oil change, brake repair, body and paint"
                />
              </label>
              <label>
                Subtotal for this service (optional)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.lineCost ?? ''}
                  onChange={fieldHandler(index, 'lineCost')}
                />
              </label>
            </div>

            <div className="service-item-lines">
              <span className="service-item-lines-label">
                Lines on the receipt
                <small>Each charge as it was printed, and what kind of charge it is.</small>
              </span>
              <ServiceLineEntriesEditor
                value={entries}
                onChange={(lineEntries) => updateRow(index, { lineEntries })}
                subtotalHint={entries.length > 0 && subtotal ? `These lines total ${subtotal}` : ''}
              />
            </div>

            <details className="service-item-legacy" open={hasLegacyText}>
              <summary>Older summary fields</summary>
              <label>
                Parts replaced
                <textarea
                  value={row.partsReplaced ?? ''}
                  onChange={fieldHandler(index, 'partsReplaced')}
                  rows="2"
                />
              </label>
              <label>
                Labor performed
                <textarea
                  value={row.laborPerformed ?? ''}
                  onChange={fieldHandler(index, 'laborPerformed')}
                  rows="2"
                />
              </label>
              <small className="service-item-legacy-note">
                Kept for records created before the receipt was read line by line. The lines
                above are what the rest of Trevora reads.
              </small>
            </details>
          </div>
        );
      })}

      <button type="button" className="button-secondary service-item-add" onClick={addRow}>
        + Add another service
      </button>
    </div>
  );
}
