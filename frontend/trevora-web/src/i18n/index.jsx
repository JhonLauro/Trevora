import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import en from './locales/en.json';
import tl from './locales/tl.json';
import ceb from './locales/ceb.json';

/**
 * Trevora in more than one language.
 *
 * <p>Written here rather than pulled from a library. What a catalogue of this
 * size actually needs is lookup, one kind of placeholder, and a fallback --
 * about eighty lines. A library brings plural rules and locale negotiation
 * that Tagalog and Cebuano barely use, plus a dependency four people have to
 * learn to edit a label.
 *
 * <p><b>What is translated, and what deliberately is not.</b> The shell is:
 * navigation, buttons, headings, field labels, the words that frame the app.
 * Service vocabulary is not. Mechanics in Cebu speak Bisaya and still say
 * "change oil", "brake pad", "alternator", "chassis number" -- that mix is the
 * real register of the trade here, and a textbook Cebuano translation of
 * "odometer" would read stiffer and less clear to the people this is for than
 * leaving it alone. Translating the frame and keeping the vocabulary is the
 * honest version of bilingual, not a half-finished one.
 */

const CATALOGUES = { en, tl, ceb };

export const LANGUAGES = [
  { code: 'en', label: 'English', endonym: 'English' },
  { code: 'tl', label: 'Filipino', endonym: 'Filipino' },
  { code: 'ceb', label: 'Cebuano', endonym: 'Bisaya' },
];

const STORAGE_KEY = 'trevora.language';
const FALLBACK = 'en';

function readStored() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && CATALOGUES[saved]) return saved;
  } catch {
    // Private windows and blocked site data throw on access.
  }
  // The browser's own preference, before defaulting. navigator.language is
  // "en-PH" or "fil-PH", so only the part before the dash is useful here.
  try {
    const tag = (navigator.language || '').toLowerCase();
    if (tag.startsWith('fil') || tag.startsWith('tl')) return 'tl';
    if (tag.startsWith('ceb')) return 'ceb';
  } catch {
    // Ignored; the fallback below is always valid.
  }
  return FALLBACK;
}

/*
 * The same lookup, for code that is not a component.
 *
 * A handful of plain helpers -- displayValue, coverageHint, friendlyReceiptError
 * -- build user-facing strings, and a hook cannot be called from them. Rather
 * than thread `t` through every signature, the provider keeps this module
 * variable in step with the language it is rendering, and helpers import
 * `translate as t`. Inside a component the hook's own `t` shadows the import,
 * so both spellings mean the same thing at the same moment.
 */
let activeLanguage = FALLBACK;

export function translate(key, vars) {
  const raw = CATALOGUES[activeLanguage]?.[key] ?? CATALOGUES[FALLBACK][key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  ));
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStored);
  activeLanguage = language;

  const setLanguage = useCallback((code) => {
    if (!CATALOGUES[code]) return;
    setLanguageState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // A language that does not persist is still better than none.
    }
    document.documentElement.lang = code;
  }, []);

  /**
   * Look up `key`, filling {placeholders} from `vars`.
   *
   * <p>Named placeholders rather than positional ones, because word order is
   * the first thing translation changes: "3 records need review" and its
   * Cebuano equivalent put the number in different places, and a template that
   * numbers its slots cannot survive that.
   *
   * <p>A missing key falls back to English, then to the key itself. Showing
   * "garage.title" on screen is ugly, and that is the point -- it is visible in
   * testing rather than silently blank.
   */
  const t = useCallback((key, vars) => {
    const raw = CATALOGUES[language]?.[key] ?? CATALOGUES[FALLBACK][key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (whole, name) => (
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
    ));
  }, [language]);

  /**
   * A phrase that counts something.
   *
   * <p>`pluralize(14, 'record')` bolts an "s" on and cannot be translated:
   * Tagalog and Cebuano do not inflect the noun, so 1 and 14 are both
   * "rekord". English needs two forms, they need one, and other languages
   * need more -- so the catalogue holds the whole phrase per case rather than
   * a noun this code tries to bend.
   *
   * <p>Keys are `<key>.one` and `<key>.other`. Languages with a single form
   * set both to the same string, which reads as duplication and is not: it is
   * each language stating its own rule instead of inheriting English's.
   */
  const plural = useCallback((key, count, vars) => {
    const form = count === 1 ? `${key}.one` : `${key}.other`;
    const raw = CATALOGUES[language]?.[form]
      ?? CATALOGUES[FALLBACK][form]
      ?? CATALOGUES[FALLBACK][key]
      ?? form;
    return raw.replace(/\{(\w+)\}/g, (whole, name) => {
      if (name === 'count') return String(count);
      const supplied = vars && Object.prototype.hasOwnProperty.call(vars, name);
      return supplied ? String(vars[name]) : whole;
    });
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t, plural }),
    [language, setLanguage, t, plural],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside <LanguageProvider>.');
  return value;
}

/**
 * One validation issue's message, in the reader's language.
 *
 * <p>The server sends both: `message`, English prose that a log or a test can
 * read, and `messageKey` with the values the sentence names. Preferring the key
 * lets each language put the date and the total where its own grammar wants
 * them, rather than in the order English happened to concatenate them.
 *
 * <p>An argument may itself be a key. "for the same total" and "at the same
 * odometer reading" are phrases, not data, so the server names which one
 * matched and the catalogue holds the wording.
 *
 * <p>Falls back to the English prose when no key is given, so an issue the
 * server has not keyed yet still reads rather than showing a blank.
 */
export function issueText(issue, t) {
  if (!issue) return '';
  if (!issue.messageKey) return issue.message ?? '';

  const args = { ...(issue.messageArgs ?? {}) };
  for (const [name, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.startsWith('issue.')) {
      args[name] = t(value);
    }
  }
  return t(issue.messageKey, args);
}

/** The common case: only the lookup function. */
export function useT() {
  return useLanguage().t;
}

/** For phrases built around a number. See `plural` above. */
export function usePlural() {
  return useLanguage().plural;
}
