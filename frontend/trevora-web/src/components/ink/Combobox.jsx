import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A picker you can also type into.
 *
 * The list is the point — it is what stops `Receipt` and `Koyota` becoming
 * makes — but a closed list would block anyone whose car is not in it, so
 * typing a value that matches nothing is allowed and kept. That is the whole
 * bargain: the common case becomes one tap and clean data, the rare case
 * still works.
 *
 * Deliberately not a `<select>`: a select cannot be typed into, and on a
 * phone it opens a native wheel that is miserable to scroll past twenty
 * options. Deliberately not a plain input either, for the reason above.
 *
 * ARIA: combobox + listbox with `aria-activedescendant`, so focus stays in
 * the input while the arrow keys move a highlight through the options.
 */
export default function Combobox({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  error,
  disabled,
  emptyHint,
  inputRef,
}) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const listId = `${fieldId}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  const query = String(value ?? '');
  const needle = query.trim().toLowerCase();
  // An exact match means the user has settled on an option; showing the list
  // filtered down to that one row is noise, so show everything again.
  const exact = options.some((option) => option.toLowerCase() === needle);
  const filtered = !needle || exact
    ? options
    : options.filter((option) => option.toLowerCase().includes(needle));

  useEffect(() => {
    function handlePointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Keep the highlighted row in view when the arrow keys walk past the edge
  // of the scroll box.
  useEffect(() => {
    if (!open || highlight < 0) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  function commit(option) {
    onChange(option);
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlight(0);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => {
        const next = current + step;
        if (next < 0) return filtered.length - 1;
        if (next >= filtered.length) return 0;
        return next;
      });
    } else if (event.key === 'Enter') {
      if (open && highlight >= 0 && filtered[highlight]) {
        event.preventDefault();
        commit(filtered[highlight]);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setHighlight(-1);
      }
    }
  }

  const describedBy = [
    error ? `${fieldId}-error` : null,
    hint ? `${fieldId}-hint` : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className="ink-combo" ref={wrapperRef}>
      <label className="ink-combo__label" htmlFor={fieldId}>{label}</label>
      {hint && <p className="ink-combo__hint" id={`${fieldId}-hint`}>{hint}</p>}

      <div className={`ink-combo__control${error ? ' has-error' : ''}`}>
        <input
          id={fieldId}
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && highlight >= 0 ? `${fieldId}-opt-${highlight}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(event) => { onChange(event.target.value); setOpen(true); setHighlight(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="ink-combo__toggle"
          tabIndex={-1}
          aria-label={`${open ? 'Hide' : 'Show'} ${label.toLowerCase()} options`}
          disabled={disabled}
          onClick={() => { setOpen((current) => !current); setHighlight(-1); }}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>

      {open && !disabled && (
        <ul className="ink-combo__list" id={listId} role="listbox" ref={listRef}>
          {filtered.length === 0 ? (
            <li className="ink-combo__empty" role="presentation">
              {emptyHint || 'Not on the list — what you typed will be saved as is.'}
            </li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option}
                id={`${fieldId}-opt-${index}`}
                role="option"
                aria-selected={option.toLowerCase() === needle}
                className={`ink-combo__option${index === highlight ? ' is-highlighted' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => { event.preventDefault(); commit(option); }}
              >
                {option}
              </li>
            ))
          )}
        </ul>
      )}

      {error && <p className="ink-combo__error" id={`${fieldId}-error`}>{error}</p>}
    </div>
  );
}
