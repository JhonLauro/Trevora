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

/** Folded, then stripped of anything that is not a letter or a digit. */
function squash(text) {
  return fold(text).replace(/[^a-z0-9]+/g, '');
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
  dataTip,
  aliases,
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
  /* Matched against the option plus whatever else that option is called.
     "G-Wagon" has to find G-Class, because the official name is not the name
     anybody uses -- and the value committed is still the official one, so one
     car is never filed under two spellings. */
  /* Matched twice: as typed, and with every space and hyphen removed from
     both sides. People write "gwagon", "g wagon" and "G-Wagon" for the same
     car, and a picker that only recognises the spacing it chose hides that car
     from most of the people looking for it. The same pass finds
     "Mercedes-Benz" from "mercedesbenz". */
  const squashed = squash(query);

  /* How well an option answers what was typed. Lower is better.

     Matching anywhere in the string is right -- it is what finds "Mercedes-Benz"
     from "benz" -- but on its own it buries the obvious answer: typing "to"
     listed Aston Martin, Brixton and CFMoto while Toyota sat below the fold,
     because "to" appears inside all of them. A picker that cannot surface
     Toyota for "to" is not a picker.

     So the matches are banded. What starts with what you typed comes first,
     then what has a word starting with it (so "class" still finds G-Class),
     then anything else containing it. Within a band the original order stands:
     alphabetical for makes, and for a make's models the order the catalogue
     chose, which is by how common the car is here. */
  const matchRank = (option) => {
    const text = fold(option);
    if (text.startsWith(needle)) return 0;
    if (text.split(/[^a-z0-9]+/).some((word) => word.startsWith(needle))) return 1;
    if (text.includes(needle)) return 2;
    // Reached only by an alias or by ignoring spacing, so it goes last: the
    // name itself does not contain what was typed.
    return 3;
  };

  const filtered = !needle || browsing
    ? options
    : options
        .filter((option) => {
          const text = `${option} ${aliases?.[option] ?? ''}`;
          return fold(text).includes(needle)
            || (squashed.length > 0 && squash(text).includes(squashed));
        })
        // Stable, so equally-ranked options keep the order they arrived in.
        .sort((first, second) => matchRank(first) - matchRank(second));

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
    <div className="ink-combo" ref={wrapperRef} data-tip={dataTip}>
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
