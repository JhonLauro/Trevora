import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * A closed-set filter picker, in the Ink dropdown language.
 *
 * Deliberately not a `<select>`. The browser draws a native select's popup
 * itself — system font, system blue highlight, system row height — so on
 * Windows the open list arrived looking like nothing else in the app, and no
 * amount of CSS on the element can reach it. The trigger can be styled; the
 * list cannot. This renders both.
 *
 * The second reason is `hint`: a native option is a single string, so two
 * vehicles both nicknamed "Honda Beat" produced two identical rows with no way
 * to tell them apart. Here each row carries a quiet second line (the plate),
 * which is what makes the choice answerable.
 *
 * Not a {@link Combobox}: that one exists to accept values outside its list.
 * A filter has no such case — every option is known — so there is nothing to
 * type and the input, its filtering and its free-text bargain are all dead
 * weight here.
 *
 * ARIA: button + listbox. Focus moves into the list on open and returns to the
 * trigger on close, with `aria-activedescendant` tracking the highlight.
 */
export default function FilterMenu({ label, value, onChange, options, className = '' }) {
  const fieldId = useId();
  const listId = `${fieldId}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  useEffect(() => {
    function handlePointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Focus the list on open so the arrow keys work without a second tab, and
  // start on the current value rather than the top of the list.
  useEffect(() => {
    if (!open) return;
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
    listRef.current?.focus();
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  function close({ refocus = true } = {}) {
    setOpen(false);
    setHighlight(-1);
    if (refocus) triggerRef.current?.focus();
  }

  function commit(option) {
    onChange(option.value);
    close();
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => {
        const next = current + step;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setHighlight(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (options[highlight]) commit(options[highlight]);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      // Escape cancels; Tab is a deliberate move away, so let it through
      // rather than trapping focus back on the trigger.
      if (event.key === 'Escape') event.preventDefault();
      close({ refocus: event.key === 'Escape' });
    }
  }

  return (
    <div className={`ink-filter${className ? ` ${className}` : ''}`} ref={wrapperRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`ink-filter__trigger${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="ink-filter__value">{selected?.label}</span>
        <ChevronDown className="ink-filter__caret" size={18} aria-hidden="true" />
      </button>

      {open && (
        <ul
          className="ink-filter__list"
          id={listId}
          role="listbox"
          tabIndex={-1}
          ref={listRef}
          aria-label={label}
          aria-activedescendant={highlight >= 0 ? `${fieldId}-opt-${highlight}` : undefined}
          onKeyDown={handleKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${fieldId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                className={`ink-filter__option${index === highlight ? ' is-highlighted' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => { event.preventDefault(); commit(option); }}
              >
                <span className="ink-filter__option-text">
                  <span className="ink-filter__option-label">{option.label}</span>
                  {option.hint && <span className="ink-filter__option-hint">{option.hint}</span>}
                </span>
                {isSelected && <Check className="ink-filter__tick" size={16} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
