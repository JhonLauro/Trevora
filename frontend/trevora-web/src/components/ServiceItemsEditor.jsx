import React from 'react';

function emptyRow(sortOrder = 0) {
  return {
    itemId: null,
    serviceType: '',
    serviceCategory: '',
    partsReplaced: '',
    laborPerformed: '',
    lineCost: '',
    sortOrder,
  };
}

/**
 * Repeatable add/remove row editor for a service_draft/service_record's `services` array.
 * Controlled component: `value` is the array of service line items, `onChange` receives the
 * next array on every edit. Defaults to a single empty row when `value` is empty/undefined.
 */
export default function ServiceItemsEditor({ value, onChange }) {
  const items = Array.isArray(value) && value.length > 0 ? value : [emptyRow(0)];

  function updateRow(index, patch) {
    const next = items.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    onChange(next);
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
      {items.map((row, index) => (
        <div className="service-item-row" key={row.itemId ?? `service-item-new-${index}`}>
          <div className="service-item-row-header">
            <span>Service {index + 1}</span>
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
              Service type
              <input
                value={row.serviceType ?? ''}
                onChange={fieldHandler(index, 'serviceType')}
                placeholder="Oil change, brake repair, tune-up"
              />
            </label>
            <label>
              Line cost (optional)
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.lineCost ?? ''}
                onChange={fieldHandler(index, 'lineCost')}
              />
            </label>
          </div>

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
        </div>
      ))}

      <button type="button" className="button-secondary service-item-add" onClick={addRow}>
        + Add another service
      </button>
    </div>
  );
}
