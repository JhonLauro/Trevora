/**
 * Keyword attribution of a service record to vehicle components.
 *
 * Lifted out of VehicleServiceHistoryPage so the parts map, the vehicle page
 * and the dashboard all read one set of rules.
 *
 * This is a stopgap. Attribution should be stored on the record so a user can
 * correct it — a map re-derived from keywords on every render cannot be fixed.
 * See planning/DEFERRED.md.
 */
import { serviceItemsArray } from './serviceText';
import { vehicleClassFor } from '../data/vehicleCatalog';

/* Shared between both vehicle classes — an engine is an engine. */
const COMMON_RULES = [
  ['brakes', /\bbrake|rotor|pad|caliper|fluid flush/i],
  ['tires', /\btire|tyre|wheel|alignment|balanc|vibration/i],
  ['suspension', /\bsuspension|shock|strut|fork|alignment|camber|toe/i],
  ['battery', /\bbattery|crank|terminal|motolite/i],
  ['airFilter', /\bair filter|intake|filter box/i],
  ['cooling', /\bcoolant|radiator|thermostat|overheat/i],
  ['lights', /\blight|headlamp|tail|signal|bulb/i],
  ['exhaust', /\bexhaust|muffler|emission/i],
  ['fluids', /\bfluid|oil|lubricant|washer/i],
  ['engine', /\boil|engine|spark|pms|tune|valve|inspection/i],
];

/* Cars only. A motorcycle has none of these, and matching them against a
   rider's history would invent parts the vehicle does not have. */
const CAR_ONLY_RULES = [
  ['transmission', /\btransmission|gearbox|clutch|atf|cvt/i],
  ['ac', /\baircon|a\/c| ac |compressor|freon/i],
  ['body', /\bbody|door|paint|panel|wiper|windshield/i],
];

/* Motorcycles only. Chain and CVT service has no car equivalent and is the
   most frequent thing in a rider's history, so it cannot be folded into
   "transmission" and left there. */
const MOTORCYCLE_ONLY_RULES = [
  ['drive', /\bchain|sprocket|cvt|belt|roller|pulley|clutch/i],
  ['fairings', /\bfairing|cowl|body|plastic|decal|paint/i],
];

export const COMPONENT_RULES = [...COMMON_RULES, ...CAR_ONLY_RULES];

export function componentRulesFor(vehicleClass) {
  return vehicleClass === 'motorcycle'
    ? [...COMMON_RULES, ...MOTORCYCLE_ONLY_RULES]
    : [...COMMON_RULES, ...CAR_ONLY_RULES];
}

export function componentKeysFor(vehicleClass) {
  return componentRulesFor(vehicleClass).map(([key]) => key);
}

/**
 * The order components are numbered and listed in, which is not the order the
 * rules above happen to be written in.
 *
 * The parts map numbers each component by its position here, globally rather
 * than per view, so 5 is Tires on every tab and every body type. That only
 * works if the order is grouped by where the component lives: everything the
 * side view carries first, then everything under the bonnet. A car's side view
 * therefore reads 1-6 and its bonnet 7-13, and a rider's 1-7 and 8-12.
 *
 * Every key in `componentKeysFor` has to appear here, or it would be numbered
 * off the end of the list.
 */
const COMPONENT_ORDER = {
  car: ['lights', 'body', 'suspension', 'brakes', 'tires', 'exhaust',
    'cooling', 'fluids', 'battery', 'airFilter', 'engine', 'ac', 'transmission'],
  motorcycle: ['lights', 'fairings', 'suspension', 'brakes', 'tires', 'exhaust', 'drive',
    'cooling', 'airFilter', 'battery', 'engine', 'fluids'],
};

function componentOrderFor(vehicleClass) {
  return vehicleClass === 'motorcycle' ? COMPONENT_ORDER.motorcycle : COMPONENT_ORDER.car;
}

/** 1-based position of each component in its class taxonomy — the map's marker numbers. */
export function componentNumbersFor(vehicleClass) {
  return Object.fromEntries(componentOrderFor(vehicleClass).map((key, index) => [key, index + 1]));
}

export const COMPONENT_LABELS = {
  engine: 'Engine',
  drive: 'Drive chain and CVT',
  fairings: 'Fairings and body',
  tires: 'Tires',
  brakes: 'Brakes',
  battery: 'Battery',
  airFilter: 'Air filter',
  transmission: 'Transmission',
  cooling: 'Cooling system',
  suspension: 'Suspension',
  lights: 'Lights',
  ac: 'Air conditioning',
  body: 'Body',
  exhaust: 'Exhaust',
  fluids: 'Fluids',
};

const COMPONENT_KEY_BY_LABEL = {
  Engine: 'engine',
  'Engine Oil': 'engine',
  'Oil Filter': 'engine',
  Brakes: 'brakes',
  Tires: 'tires',
  Battery: 'battery',
  'Air Filter': 'airFilter',
  Transmission: 'transmission',
  'Cooling System': 'cooling',
  Suspension: 'suspension',
  Lights: 'lights',
  'AC System': 'ac',
  Electrical: 'battery',
  Body: 'body',
  Fluids: 'fluids',
};

/**
 * Everything about a record a person might type into the search box: the
 * services, the shop, where it was, the remarks. Deliberately broad — someone
 * looking for "Rapide" or "Cebu" should find it.
 *
 * **Not for attribution.** This was doing both jobs, and that was the bug: a
 * shop called Brake Masters lit up the Brakes marker on every record from it.
 * See `componentEvidenceText`.
 */
export function recordSearchText(record) {
  const itemsText = serviceItemsArray(record?.services)
    .map((item) => [
      item.serviceType,
      item.serviceCategory,
      item.partsReplaced,
      item.laborPerformed,
      // Every printed line regardless of kind. Attribution must not read
      // these, but search must: once a record carries line entries, they hold
      // the text an owner would actually search for, and the two legacy
      // columns above are on their way out.
      ...(Array.isArray(item.lineEntries) ? item.lineEntries : [])
        .flatMap((entry) => [entry?.description, entry?.partCode]),
    ].filter(Boolean).join(' '))
    .join(' ');
  return [itemsText, record?.category, record?.shopName, record?.location, record?.remarks]
    .filter(Boolean)
    .join(' ');
}

/**
 * The only text allowed to say which component was serviced: the operation.
 *
 * A receipt line is one of four things (migration 011). Only an OPERATION says
 * what the shop did to the vehicle. A PART is a thing fitted, a MATERIAL is
 * consumed doing the work, a FEE is neither — and none of them identify a
 * component on their own. Reading all of them together is what put a green
 * Brakes marker on a body-and-paint job, because the materials list contained
 * a "WASTE PAD" and `/pad/` matched it.
 *
 * Falls back to `laborPerformed` for records written before 011, which is
 * exactly the claim the backfill made when it turned that column into
 * OPERATION rows. `partsReplaced` is never read here: pre-011 it was the
 * bucket every consumable was wrongly filed into, so it is precisely the
 * field that cannot be trusted to name a component.
 */
export function componentEvidenceText(record) {
  return serviceItemsArray(record?.services)
    .map((item) => {
      const entries = Array.isArray(item?.lineEntries) ? item.lineEntries : [];
      const operations = entries
        .filter((entry) => entry?.kind === 'OPERATION')
        .map((entry) => entry?.description);
      // No line entries at all means a legacy row the backfill has not reached
      // (or one with no lines); its labour column is the same claim.
      const labour = operations.length || entries.length ? operations : [item?.laborPerformed];
      return [item?.serviceType, ...labour].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {object} record
 * @param {'car'|'motorcycle'} vehicleClass which taxonomy to match against.
 *   Defaults to car, which is what every vehicle created before body type
 *   existed is.
 */
export function inferComponents(record, vehicleClass = 'car') {
  const controlled = Array.isArray(record?.relatedComponents)
    ? record.relatedComponents
    : Array.isArray(record?.classification?.relatedComponents)
      ? record.classification.relatedComponents
      : [];
  const mapped = controlled.map((component) => COMPONENT_KEY_BY_LABEL[component]).filter(Boolean);
  if (mapped.length) return [...new Set(mapped)];

  const haystack = componentEvidenceText(record);
  const matches = componentRulesFor(vehicleClass)
    .filter(([, pattern]) => pattern.test(haystack))
    .map(([key]) => key);
  if (matches.length) return [...new Set(matches)];

  if (String(record?.category || '').toLowerCase().includes('inspection')) {
    return ['engine', 'brakes', 'tires', 'lights'];
  }
  return ['engine'];
}

/** Convenience for callers that hold a vehicle rather than a class. */
export function inferComponentsForVehicle(record, vehicle) {
  return inferComponents(record, vehicleClassFor(vehicle?.bodyType));
}
