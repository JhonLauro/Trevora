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

export function recordSearchText(record) {
  const itemsText = serviceItemsArray(record?.services)
    .map((item) => [item.serviceType, item.serviceCategory, item.partsReplaced, item.laborPerformed]
      .filter(Boolean).join(' '))
    .join(' ');
  return [itemsText, record?.category, record?.shopName, record?.location, record?.remarks]
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

  const haystack = recordSearchText(record);
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
