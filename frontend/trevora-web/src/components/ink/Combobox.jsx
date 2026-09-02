import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Lowercased and stripped of accents, for comparing what was typed against
 * what is listed.
 *
 * Nobody reaches for the ¨ key to look up a Citroën, and a search that only
 * matches the correctly-accented spelling tells them their car is not in a
 * list it is sitting in. Škoda has the same problem.
 */
function fold(text) {
  return String(text ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

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
  /* Set only by the chevron, cleared by any keystroke. Typing always filters —
     typing "BYD" and being shown 205 brands is the list ignoring you — but a
     field that already holds a make still has to be re-openable to change it,
     and filtering "BYD" down to BYD would leave nothing to change it to. The
     chevron is that door. */
  const [browsing, setBrowsing] = useState(false);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  const query = String(value ?? '');
  const needle = fold(query);
  const filtered = !needle || browsing
    ? options
    : options.filter((option) => fold(option).includes(needle));

  /* A field with nothing to offer does not open a list. Picking a make the
     catalogue holds no models for used to drop a one-row popup reading "not on
     the list — it will be saved exactly as you typed it" before anything had
     been typed. With 205 makes and models for nineteen of them that is now the
     common case, and the field is simply a text box in it.

     Note this is `options`, not `filtered`: text matching nothing SHOULD still
     get that row, because there was a list and the answer is not in it. */
  const hasOptions = options.length > 0;
  const expanded = open && hasOptions && !disabled;

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
    setBrowsing(false);
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
          autoComplete="off"
          /* With no options this is a text box and says so. Announcing a
             combobox whose listbox never appears sends a screen reader looking
             for a list that is not there. */
          role={hasOptions ? 'combobox' : undefined}
          aria-expanded={hasOptions ? expanded : undefined}
          aria-controls={hasOptions ? listId : undefined}
          aria-autocomplete={hasOptions ? 'list' : undefined}
          aria-activedescendant={expanded && highlight >= 0 ? `${fieldId}-opt-${highlight}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setBrowsing(false);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {/* Nothing to drop down, so no control that promises one. */}
        {hasOptions && (
        <button
          type="button"
          className="ink-combo__toggle"
          tabIndex={-1}
          aria-label={`${open ? 'Hide' : 'Show'} ${label.toLowerCase()} options`}
          disabled={disabled}
          onClick={() => {
            // Opening from the chevron is a request to see the whole list.
            const next = !open;
            setOpen(next);
            setBrowsing(next);
            setHighlight(-1);
          }}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        )}
      </div>

      {expanded && (
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
                aria-selected={fold(option) === needle}
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
