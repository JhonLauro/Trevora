import React from 'react';
import { Trash2 } from 'lucide-react';
import { DEFAULT_LINE_KIND, LINE_KINDS, formatPeso, lineEntriesOf } from '../utils/serviceLines';

function emptyEntry() {
  return {
    entryId: null,
    kind: DEFAULT_LINE_KIND,
    description: '',
    partCode: '',
    quantity: '',
    unitPrice: '',
    lineTotal: '',
  };
}

/**
 * The receipt, line by line, in the order it was printed.
 *
 * <p>Receipt order rather than grouped by kind, because this is verified
 * against the paper in the owner's hand: they read down their receipt and read
 * down this list. The per-kind tally lives above it, where a count of
 * "3 parts, 11 supplies" is a summary rather than a filing scheme.
 *
 * <p>Every line carries its kind as an editable control. The kind is the field
 * the rest of the product reads — only a labour line may say which part of the
 * vehicle was serviced — so it is the one thing here worth an owner's
 * attention even when the wording is already right.
 */
export default function ServiceLineEntriesEditor({ value, onChange, subtotalHint }) {
  const entries = Array.isArray(value) ? value : [];

  function updateEntry(index, patch) {
    onChange(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function fieldHandler(index, field) {
    return (event) => updateEntry(index, { [field]: event.target.value });
  }

  function addEntry() {
    onChange([...entries, emptyEntry()]);
  }

  function removeEntry(index) {
    onChange(entries.filter((_, entryIndex) => entryIndex !== index));
  }

  if (entries.length === 0) {
    return (
      <div className="line-entries">
        <div className="line-entries-empty">
          <strong>No itemised lines were read from this receipt.</strong>
          <span>
            Add them to record what each charge was for. Without lines, the record shows a total
            and nothing about what it paid for.
          </span>
        </div>
        <button type="button" className="button-secondary line-entry-add" onClick={addEntry}>
          + Add a line
        </button>
      </div>
    );
  }

  return (
    <div className="line-entries">
      <ol className="line-entry-list">
        {entries.map((entry, index) => {
          const kind = LINE_KINDS.find((option) => option.value === entry.kind)
            ?? LINE_KINDS.find((option) => option.value === DEFAULT_LINE_KIND);
          return (
            <li className={`line-entry line-entry-${(entry.kind || DEFAULT_LINE_KIND).toLowerCase()}`} key={entry.entryId ?? `new-${index}`}>
              <div className="line-entry-main">
                <input
                  className="line-entry-description"
                  value={entry.description ?? ''}
                  onChange={fieldHandler(index, 'description')}
                  placeholder="As printed on the receipt"
                  aria-label={`Line ${index + 1} description`}
                />
                <input
                  className="line-entry-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={entry.lineTotal ?? ''}
                  onChange={fieldHandler(index, 'lineTotal')}
                  placeholder="Amount"
                  aria-label={`Line ${index + 1} amount`}
                />
                <button
                  type="button"
                  className="line-entry-remove"
                  onClick={() => removeEntry(index)}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="line-entry-meta">
                <label className="line-entry-kind">
                  <span className="sr-only">{`Line ${index + 1} kind`}</span>
                  <select value={entry.kind ?? DEFAULT_LINE_KIND} onChange={fieldHandler(index, 'kind')}>
                    {LINE_KINDS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {entry.partCode ? <span className="line-entry-code">{entry.partCode}</span> : null}
                <span className="line-entry-kind-hint">{kind.hint}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="line-entries-footer">
        <button type="button" className="button-secondary line-entry-add" onClick={addEntry}>
          + Add a line
        </button>
        {subtotalHint ? <span className="line-entries-subtotal">{subtotalHint}</span> : null}
      </div>
    </div>
  );
}

/** Read-only rendering of one service item's lines. */
export function ServiceLineEntriesList({ item }) {
  const entries = lineEntriesOf(item);
  if (entries.length === 0) return null;

  return (
    <ul className="line-entry-readout">
      {entries.map((entry, index) => {
        const amount = formatPeso(entry.lineTotal);
        return (
          <li key={entry.entryId ?? `entry-${index}`}>
            <span className={`line-entry-tag line-entry-tag-${String(entry.kind || DEFAULT_LINE_KIND).toLowerCase()}`}>
              {LINE_KINDS.find((option) => option.value === entry.kind)?.label
                ?? LINE_KINDS.find((option) => option.value === DEFAULT_LINE_KIND).label}
            </span>
            <span className="line-entry-readout-description">{entry.description}</span>
            <span className="line-entry-readout-amount">{amount ?? '—'}</span>
          </li>
        );
      })}
    </ul>
  );
}
