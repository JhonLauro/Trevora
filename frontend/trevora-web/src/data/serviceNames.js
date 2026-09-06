/**
 * Suggested names for a service — what the job was called, not what kind of
 * work it is.
 *
 * <p>These are `serviceType` only. They are deliberately **not** mapped to
 * `serviceCategory`: a static name→category table here would be a second
 * definition of category assignment competing with
 * `ServiceClassificationService`, which is the mistake `serviceCategory.js`
 * was just rescued from — it had its own vocabulary and re-derived the value
 * from regexes, and was one of four disagreeing definitions. Whatever sets the
 * category today keeps setting it.
 *
 * <p>Nothing here is a closed list. A receipt says whatever the shop chose to
 * print, and the field accepts anything typed; these only save the typing when
 * the shop's wording happens to be the ordinary one.
 */

/** The ordinary names, as a Philippine shop would print them. */
export const COMMON_SERVICE_NAMES = [
  'Oil change',
  'Preventive maintenance service (PMS)',
  'Brake repair and inspection',
  'Tire services',
  'Wheel alignment and balancing',
  'Battery services',
  'Electrical system repairs',
  'Air conditioning service',
  'Cooling system service',
  'Engine diagnostic',
  'Suspension and steering repair',
  'Transmission repair',
  'Fuel system service',
  'Belt and hose replacement',
  'Body and paint',
  'Towing and roadside',
];

/**
 * What people call these things, mapped to the name on the list.
 *
 * <p>Nobody types "Cooling system service". They type "radiator", because
 * that is the part that was leaking and the word the shop used. A list that
 * only matches its own wording is a list that hides the right answer from
 * anyone who does not already know our vocabulary -- and the owners this is
 * for are the ones least likely to.
 *
 * <p>Three kinds of entry, all of them things a receipt or an owner actually
 * says:
 *
 * <ul>
 *   <li>The part, for the service that touches it -- radiator, injector,
 *       shock absorber. This is how most people name a job: by what broke.
 *   <li>Philippine English, which is not American English. "Change oil", not
 *       "oil change". "Vulcanizing" for tire repair. "Aircon".
 *   <li>Filipino words in common workshop use -- langis, gulong, preno.
 * </ul>
 *
 * <p>Search only. What gets saved is always the name from the list or exactly
 * what was typed, so one job is never filed under two spellings.
 *
 * <p>Adding to this is the cheapest improvement available here: a word that
 * did not find anything is one line.
 */
export const SERVICE_NAME_ALIASES = {
  'Oil change': 'change oil changeoil engine oil motor oil oil filter lube lubrication langis LOF',
  'Preventive maintenance service (PMS)':
    'PMS periodic maintenance scheduled maintenance check up checkup general check tune up tuneup servicing',
  'Brake repair and inspection':
    'brake brakes brake pad brake pads brake shoe brake fluid disc rotor caliper drum preno',
  'Tire services':
    'tire tires tyre tyres tire repair vulcanizing vulcanize flat tire tubeless patch rim gulong',
  'Wheel alignment and balancing':
    'alignment align balancing balance wheel align camber toe in caster',
  'Battery services': 'battery batt terminal jumpstart jump start charging baterya',
  'Electrical system repairs':
    'electrical wiring alternator starter fuse lights headlight tail light horn relay solenoid short circuit kuryente',
  'Air conditioning service':
    'aircon aircon repair air con freon compressor evaporator condenser blower cabin filter recharge cooling unit',
  'Cooling system service':
    'radiator radiator repair radyator coolant overheat overheating overheated thermostat water pump cooling fan reservoir',
  'Engine diagnostic':
    'diagnostic diagnosis check engine engine light OBD scan scanner error code trouble code misfire makina',
  'Suspension and steering repair':
    'suspension shock shocks shock absorber strut steering tie rod ball joint bushing stabilizer coil spring link rod',
  'Transmission repair':
    'transmission clutch gearbox gear automatic manual ATF CVT flywheel kambyo',
  'Fuel system service':
    'fuel fuel system repair injector injectors carburetor carb fuel pump fuel filter gasoline diesel throttle gasolina',
  'Belt and hose replacement':
    'belt belts timing belt fan belt serpentine hose hoses tensioner pulley',
  'Body and paint':
    'body body repair collision repair paint repaint dent scratch bumper fender door panel putty masilya collision buff polish pintura',
  'Towing and roadside':
    'tow towing roadside assistance breakdown stalled stuck hatak',
};

/** Trimmed and folded, for comparing two names that are the same name. */
function key(name) {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * What to offer for one service row.
 *
 * <p>The draft's own other service names come first. A receipt that already
 * produced two services has told us how this shop writes things, and that is
 * worth more than any list we could ship — the second job on a Toyota Talisay
 * invoice is far likelier to be named the way the first one was.
 *
 * <p>Names already used in this draft are removed rather than shown and
 * ignored. Two services with the same name is not something to suggest.
 *
 * @param services      every service on the draft
 * @param currentIndex  the row being edited, whose own name is not a
 *                      suggestion for itself
 * @param query         what has been typed so far; empty offers everything
 */
export function serviceNameSuggestions(services, currentIndex, query = '') {
  const rows = Array.isArray(services) ? services : [];

  const fromDraft = rows
    .map((service, index) => (index === currentIndex ? '' : service?.serviceType))
    .map((name) => String(name ?? '').trim())
    .filter(Boolean);

  /* Names already on the draft, which are not offered again: two services
     called the same thing is not something to suggest.

     Note what this does to `fromDraft` above. A draft name is by definition
     already on the draft, so this filter removes every one of them, and the
     list that actually reaches the owner is the static one. The draft-first
     ordering is kept because it is free and because it starts working the
     moment the rule changes -- but as things stand it contributes nothing, and
     that is a consequence of the two rules together rather than a bug in
     either. Dropping a name from this set is the one-line change that would
     turn the draft source on. */
  const taken = new Set(rows.map((service) => key(service?.serviceType)).filter(Boolean));

  const seen = new Set();
  const candidates = [];
  for (const name of [...fromDraft, ...COMMON_SERVICE_NAMES]) {
    const id = key(name);
    if (!id || seen.has(id) || taken.has(id)) continue;
    seen.add(id);
    candidates.push(name);
  }

  const squashed = key(query).replace(/[^a-z0-9]+/g, '');
  if (!squashed) return candidates;

  return candidates
    .filter((name) => matches(name, squashed) || matches(SERVICE_NAME_ALIASES[name], squashed))
    // Stable, so equally-ranked names keep the order they arrived in.
    .sort((first, second) => rank(first, squashed) - rank(second, squashed));
}

/**
 * Whether typed text finds this text, starting at a word.
 *
 * <p>Words, not substrings. A bare `includes` looked right and was not: "oil"
 * found "coil spring" and offered Suspension for somebody asking about an oil
 * change. That is the same failure that once explained a paint job as brake
 * service because "pad" appears inside "PAD-BP" -- a wrong answer given
 * confidently, which is worse than none.
 *
 * <p>Up to three words are joined and compared with the spaces removed, so
 * "change oil", "changeoil" and "Change Oil" are one query, and "shock
 * absorber" finds the entry written as two words. Joining only ever starts at
 * a word, which is what keeps "coil" out.
 */
function matches(text, squashed) {
  const words = key(text).split(/[^a-z0-9]+/).filter(Boolean);

  for (let start = 0; start < words.length; start += 1) {
    let joined = '';
    for (let span = 0; span < 3 && start + span < words.length; span += 1) {
      joined += words[start + span];
      if (joined.startsWith(squashed)) return true;
    }
  }
  return false;
}

/**
 * Lower is better.
 *
 * <p>A name that starts with what was typed comes first, then one matching
 * later in its own text, then one reached only through an alias. Somebody
 * typing "brake" means the service called Brake repair, even though "brake
 * fluid" is an alias of it too.
 */
function rank(name, squashed) {
  if (key(name).replace(/[^a-z0-9]+/g, '').startsWith(squashed)) return 0;
  if (matches(name, squashed)) return 1;
  return 2;
}
