/**
 * Vehicle catalogue — Philippine market.
 *
 * Free-text make and model produced `Receipt`, `Voice` and `Route` as makes,
 * `honda` and `Honda` as separate values, and a permanent `Koyota`. A picker
 * fixes that going forward, and it does something free text never could: it
 * lets the model carry a **body type**, which the parts map needs and which
 * nobody would reliably type themselves.
 *
 * Body type is a lookup here, not a guess. "Vios is a sedan" is a fact about
 * this table, which is why it can be trusted — anything not in the table has
 * to be asked for instead.
 *
 * This list is deliberately incomplete: it covers what people actually drive
 * here, and everything else goes through "Other", which keeps the long tail
 * usable without pretending the table is exhaustive. Adding a model is a
 * one-line change.
 */

/**
 * Body types, each with the words someone uses who does not know the word
 * "sedan".
 *
 * The jargon is the label, but nobody has to read it: the description says
 * what the vehicle looks like, and the examples name cars people can picture.
 * Most owners never see this list anyway — picking a model from the catalogue
 * fills it in — so this is the fallback for an unlisted vehicle, which is
 * exactly when the person is least likely to know the terminology.
 *
 * `vehicleClass` is the split that actually changes behaviour: a motorcycle
 * has no aircon, two tires instead of four, and a drive chain that has no car
 * equivalent. Everything downstream keys off this, not off the body type.
 */
export const BODY_TYPES = [
  {
    id: 'sedan',
    label: 'Sedan',
    vehicleClass: 'car',
    description: 'Four doors, with a separate closed boot at the back',
    examples: 'Vios, City, Almera',
  },
  {
    id: 'hatchback',
    label: 'Hatchback',
    vehicleClass: 'car',
    description: 'Smaller car — the whole back lifts up as one door',
    examples: 'Wigo, Mirage, Swift',
  },
  {
    id: 'suv',
    label: 'SUV or crossover',
    vehicleClass: 'car',
    description: 'Tall, with a high seating position',
    examples: 'Fortuner, Montero Sport, CR-V',
  },
  {
    id: 'mpv',
    label: 'MPV',
    vehicleClass: 'car',
    description: 'Family vehicle seating seven or eight',
    examples: 'Innova, Xpander, Ertiga',
  },
  {
    id: 'pickup',
    label: 'Pickup',
    vehicleClass: 'car',
    description: 'Open cargo bed at the back',
    examples: 'Hilux, Ranger, D-Max',
  },
  {
    id: 'van',
    label: 'Van',
    vehicleClass: 'car',
    description: 'Boxy, built for cargo or many passengers',
    examples: 'Hiace, L300, Urvan',
  },
  /* The three two-wheelers are separated by things an owner can name without
     looking — an apron and a floorboard, or a bare cylinder and a chain, or
     neither — rather than by engine size or by the word "scooter", which not
     everyone uses the same way. All three share `vehicleClass: 'motorcycle'`,
     so the component taxonomy is identical across them; only the drawing
     changes. */
  {
    id: 'scooter',
    label: 'Scooter',
    vehicleClass: 'motorcycle',
    description: 'Step-through with a floorboard and no visible engine',
    examples: 'Click, Mio, NMAX',
  },
  {
    id: 'underbone',
    label: 'Underbone',
    vehicleClass: 'motorcycle',
    description: 'Step-through with an exposed engine and a chain',
    examples: 'Raider, Sniper, XRM',
  },
  {
    id: 'motorcycle',
    label: 'Big bike',
    vehicleClass: 'motorcycle',
    description: 'No leg shield, with a fuel tank you sit behind',
    examples: 'Ninja 400, YZF-R15, Rouser',
  },
];

export const VEHICLE_CLASSES = ['car', 'motorcycle'];

export const OTHER = 'Other';

/* make → { model: bodyType }. Models are listed roughly by how common they
   are on the road, because the picker shows them in this order before the
   user has typed anything. */
export const VEHICLE_CATALOG = {
  Toyota: {
    Vios: 'sedan',
    'Corolla Altis': 'sedan',
    Camry: 'sedan',
    Wigo: 'hatchback',
    Raize: 'suv',
    'Corolla Cross': 'suv',
    'Yaris Cross': 'suv',
    Rush: 'suv',
    Fortuner: 'suv',
    'RAV4': 'suv',
    'Land Cruiser': 'suv',
    'Land Cruiser Prado': 'suv',
    Innova: 'mpv',
    'Innova Zenix': 'mpv',
    Avanza: 'mpv',
    Veloz: 'mpv',
    Hilux: 'pickup',
    Tamaraw: 'pickup',
    Hiace: 'van',
    'Lite Ace': 'van',
    Alphard: 'van',
    Coaster: 'van',
  },
  Mitsubishi: {
    'Mirage G4': 'sedan',
    Mirage: 'hatchback',
    Lancer: 'sedan',
    Xpander: 'mpv',
    'Xpander Cross': 'mpv',
    Adventure: 'mpv',
    'Montero Sport': 'suv',
    'Pajero Sport': 'suv',
    Outlander: 'suv',
    Strada: 'pickup',
    Triton: 'pickup',
    L300: 'van',
  },
  Honda: {
    City: 'sedan',
    Civic: 'sedan',
    Accord: 'sedan',
    Brio: 'hatchback',
    Jazz: 'hatchback',
    'BR-V': 'mpv',
    Mobilio: 'mpv',
    'HR-V': 'suv',
    'CR-V': 'suv',
    'WR-V': 'suv',
    Odyssey: 'van',
    'Click 125i': 'scooter',
    Beat: 'scooter',
    'PCX160': 'scooter',
    'ADV160': 'scooter',
    'XRM125': 'underbone',
    'TMX125': 'underbone',
    'Wave 110': 'underbone',
    Airblade: 'scooter',
  },
  Nissan: {
    Almera: 'sedan',
    Sylphy: 'sedan',
    Livina: 'mpv',
    Juke: 'suv',
    Kicks: 'suv',
    Terra: 'suv',
    'X-Trail': 'suv',
    Patrol: 'suv',
    Navara: 'pickup',
    Urvan: 'van',
  },
  Ford: {
    Ranger: 'pickup',
    'Ranger Raptor': 'pickup',
    Everest: 'suv',
    Territory: 'suv',
    Explorer: 'suv',
    Bronco: 'suv',
    EcoSport: 'suv',
    Transit: 'van',
  },
  Suzuki: {
    Dzire: 'sedan',
    Swift: 'hatchback',
    Celerio: 'hatchback',
    'S-Presso': 'hatchback',
    Ertiga: 'mpv',
    XL7: 'mpv',
    Jimny: 'suv',
    Vitara: 'suv',
    APV: 'van',
    Carry: 'van',
    'Raider R150': 'underbone',
    'Smash 115': 'underbone',
    Skydrive: 'scooter',
    'Burgman Street': 'scooter',
  },
  Isuzu: {
    'D-Max': 'pickup',
    Traviz: 'pickup',
    'mu-X': 'suv',
    Crosswind: 'mpv',
    Elf: 'van',
  },
  Hyundai: {
    Accent: 'sedan',
    Reina: 'sedan',
    Elantra: 'sedan',
    i10: 'hatchback',
    Stargazer: 'mpv',
    Creta: 'suv',
    Tucson: 'suv',
    Kona: 'suv',
    'Santa Fe': 'suv',
    Staria: 'van',
    'H-100': 'van',
  },
  Kia: {
    Soluto: 'sedan',
    Picanto: 'hatchback',
    Rio: 'hatchback',
    Stonic: 'suv',
    Seltos: 'suv',
    Sportage: 'suv',
    Sorento: 'suv',
    Carnival: 'van',
    K2500: 'pickup',
  },
  Mazda: {
    Mazda2: 'hatchback',
    Mazda3: 'sedan',
    Mazda6: 'sedan',
    'CX-3': 'suv',
    'CX-30': 'suv',
    'CX-5': 'suv',
    'CX-8': 'suv',
    'CX-9': 'suv',
    'BT-50': 'pickup',
  },
  Chevrolet: {
    Spark: 'hatchback',
    Tracker: 'suv',
    Captiva: 'suv',
    Trailblazer: 'suv',
    Colorado: 'pickup',
  },
  MG: {
    MG5: 'sedan',
    MG3: 'hatchback',
    ZS: 'suv',
    RX5: 'suv',
  },
  Geely: {
    Emgrand: 'sedan',
    Coolray: 'suv',
    Azkarra: 'suv',
    Okavango: 'suv',
  },
  Chery: {
    'Tiggo 2 Pro': 'suv',
    'Tiggo 5X': 'suv',
    'Tiggo 7 Pro': 'suv',
    'Tiggo 8 Pro': 'suv',
  },
  Subaru: {
    WRX: 'sedan',
    XV: 'suv',
    Forester: 'suv',
    Outback: 'suv',
  },
  BYD: {
    Seal: 'sedan',
    Dolphin: 'hatchback',
    'Atto 3': 'suv',
    'Sealion 6': 'suv',
  },
  Foton: {
    Toplander: 'suv',
    Thunder: 'pickup',
    Gratour: 'van',
    Transvan: 'van',
  },
  Yamaha: {
    'Mio i125': 'scooter',
    'Mio Sporty': 'scooter',
    'Mio Gear': 'scooter',
    NMAX: 'scooter',
    Aerox: 'scooter',
    'Sniper 155': 'underbone',
    'YZF-R15': 'motorcycle',
  },
  Kawasaki: {
    'Barako II': 'motorcycle',
    'CT125': 'motorcycle',
    'Ninja 400': 'motorcycle',
    'Rouser NS160': 'motorcycle',
  },
};

export function catalogMakes() {
  return Object.keys(VEHICLE_CATALOG);
}

export function modelsForMake(make) {
  const models = VEHICLE_CATALOG[make];
  return models ? Object.keys(models) : [];
}

/** The whole point of the catalogue: a known model already knows its shape. */
export function bodyTypeFor(make, model) {
  return VEHICLE_CATALOG[make]?.[model] ?? null;
}

export function isKnownMake(make) {
  return Object.prototype.hasOwnProperty.call(VEHICLE_CATALOG, make);
}

export function bodyTypeLabel(id) {
  return BODY_TYPES.find((type) => type.id === id)?.label ?? null;
}

/**
 * The only distinction the rest of the app should branch on.
 *
 * Unknown or missing body type is treated as a car, because every vehicle
 * created before the picker existed is one and the car taxonomy is the safer
 * default — it never claims a motorcycle has parts it does not have.
 */
export function vehicleClassFor(bodyType) {
  return BODY_TYPES.find((type) => type.id === bodyType)?.vehicleClass ?? 'car';
}

export function isMotorcycle(bodyType) {
  return vehicleClassFor(bodyType) === 'motorcycle';
}

/**
 * Body type for a model typed under a make the catalogue does not know.
 *
 * Someone who types "Toyata" and picks nothing still typed a real model, and
 * a Vios is a sedan whoever spelled the make. Only used to *suggest* — the
 * suggestion is labelled as one, and stays editable.
 */
export function bodyTypeForModelAnywhere(model) {
  const needle = String(model || '').trim().toLowerCase();
  if (!needle) return null;

  for (const models of Object.values(VEHICLE_CATALOG)) {
    for (const [name, bodyType] of Object.entries(models)) {
      if (name.toLowerCase() === needle) return bodyType;
    }
  }
  return null;
}
