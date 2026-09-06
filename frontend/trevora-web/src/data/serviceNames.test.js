import { describe, expect, it } from 'vitest';
import { COMMON_SERVICE_NAMES, serviceNameSuggestions } from './serviceNames.js';

const draft = (...names) => names.map((serviceType) => ({ serviceType }));

describe('serviceNameSuggestions', () => {
  it('offers the common names on an empty row', () => {
    const suggestions = serviceNameSuggestions(draft(''), 0, '');
    expect(suggestions).toEqual(COMMON_SERVICE_NAMES);
  });

  it('filters on what has been typed, anywhere in the name', () => {
    expect(serviceNameSuggestions(draft(''), 0, 'oil')).toEqual(['Oil change']);
    // "brake" is in the middle of this one, which is the point of matching
    // anywhere rather than only at the start.
    expect(serviceNameSuggestions(draft(''), 0, 'brake')).toEqual(['Brake repair and inspection']);
  });

  it('ignores case and surrounding space', () => {
    expect(serviceNameSuggestions(draft(''), 0, '  BODY  ')).toEqual(['Body and paint']);
  });

  it('does not suggest a service the draft already has', () => {
    const suggestions = serviceNameSuggestions(draft('Oil change', ''), 1, 'oil');
    expect(suggestions).toEqual([]);
  });

  it('matches an existing name regardless of how it was capitalised', () => {
    const suggestions = serviceNameSuggestions(draft('OIL CHANGE', ''), 1, '');
    expect(suggestions).not.toContain('Oil change');
  });

  /* The row being edited is not a suggestion for itself: a list offering back
     exactly what is already in the box is a no-op dressed as a choice. */
  it('never offers a row its own current name', () => {
    const suggestions = serviceNameSuggestions(draft('Body and paint'), 0, 'body');
    expect(suggestions).toEqual([]);
  });

  it('returns nothing when the typed text matches no name, without complaint', () => {
    expect(serviceNameSuggestions(draft(''), 0, 'undercoating')).toEqual([]);
  });

  /* The reason the alias table exists: an owner names the job after the part
     that broke, or in the words their shop used, and neither is our wording. */
  it('finds a service by the part somebody would name it after', () => {
    const first = (query) => serviceNameSuggestions(draft(''), 0, query)[0];
    expect(first('radiator')).toBe('Cooling system service');
    expect(first('overheating')).toBe('Cooling system service');
    expect(first('injector')).toBe('Fuel system service');
    expect(first('shock absorber')).toBe('Suspension and steering repair');
    expect(first('clutch')).toBe('Transmission repair');
    expect(first('alternator')).toBe('Electrical system repairs');
    expect(first('dent')).toBe('Body and paint');
  });

  it('speaks Philippine English rather than American', () => {
    const first = (query) => serviceNameSuggestions(draft(''), 0, query)[0];
    expect(first('change oil')).toBe('Oil change');
    expect(first('vulcanizing')).toBe('Tire services');
    expect(first('aircon')).toBe('Air conditioning service');
    expect(first('PMS')).toBe('Preventive maintenance service (PMS)');
  });

  it('understands the Filipino words a shop would use', () => {
    const first = (query) => serviceNameSuggestions(draft(''), 0, query)[0];
    expect(first('langis')).toBe('Oil change');
    expect(first('gulong')).toBe('Tire services');
    expect(first('preno')).toBe('Brake repair and inspection');
    expect(first('baterya')).toBe('Battery services');
  });

  it('does not care how the words are spaced', () => {
    const first = (query) => serviceNameSuggestions(draft(''), 0, query)[0];
    expect(first('changeoil')).toBe('Oil change');
    expect(first('air con')).toBe('Air conditioning service');
    expect(first('shockabsorber')).toBe('Suspension and steering repair');
  });

  /* A name matching in its own text beats one reached through an alias, so
     the obvious answer is not buried under a coincidence. */
  it('puts a name match above an alias match', () => {
    expect(serviceNameSuggestions(draft(''), 0, 'brake')[0]).toBe('Brake repair and inspection');
    expect(serviceNameSuggestions(draft(''), 0, 'oil')[0]).toBe('Oil change');
    expect(serviceNameSuggestions(draft(''), 0, 'body')[0]).toBe('Body and paint');
  });

  /* "Repair" is how somebody describes the visit before they know which job
     it was. It has to reach the ones named for it and the ones people simply
     call a repair — and still leave out routine maintenance, or the word
     stops narrowing anything. */
  it('treats repair as the word for a fix, named or not', () => {
    const found = serviceNameSuggestions(draft(''), 0, 'repair');

    expect(found).toContain('Brake repair and inspection');
    expect(found).toContain('Transmission repair');
    expect(found).toContain('Body and paint');
    expect(found).toContain('Air conditioning service');
    expect(found).toContain('Cooling system service');

    // Routine work is not a repair, and saying so is what keeps the word
    // useful: a query that matches everything has filtered nothing.
    expect(found).not.toContain('Oil change');
    expect(found).not.toContain('Preventive maintenance service (PMS)');
    expect(found).not.toContain('Wheel alignment and balancing');
    expect(found).not.toContain('Towing and roadside');
  });

  it('puts the services actually named repair first', () => {
    const found = serviceNameSuggestions(draft(''), 0, 'repair');
    expect(found.slice(0, 4)).toEqual([
      'Brake repair and inspection',
      'Electrical system repairs',
      'Suspension and steering repair',
      'Transmission repair',
    ]);
  });

  it('survives a draft that is missing or malformed', () => {
    expect(serviceNameSuggestions(undefined, 0, 'oil')).toEqual(['Oil change']);
    expect(serviceNameSuggestions([{}, null], 0, 'oil')).toEqual(['Oil change']);
  });
});
