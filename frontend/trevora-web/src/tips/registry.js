/**
 * Every in-app tip, and the only file that has to change to add one.
 *
 * <p>A tip is a short card pointing at one real control on one real screen,
 * shown once per account and never again. It is not the walkthrough: that is a
 * preview of the product before the product, out of context and with invented
 * data. This is the actual button, at the moment it matters.
 *
 * <p>Adding a tip is an entry here plus a `data-tip` attribute on the element.
 * Nothing in the database describes a tip, so a new one needs no migration and
 * is shown once to accounts that already exist.
 *
 * <p>Fields:
 * - `key`      the identifier stored against the account. Never reuse or
 *              rename one: a changed key is a new tip, and everybody who
 *              dismissed the old one sees it again.
 * - `match`    which pathnames this tip belongs to.
 * - `anchor`   the `data-tip` value of the element to highlight.
 * - `title`    four or five words. It is a label, not a sentence.
 * - `body`     one sentence saying what the thing does or why it matters.
 *              Two at the absolute most; this is a card over somebody's work.
 *
 * <p>Tips on the same screen run in the order they appear here.
 */

/** The guided path a new owner is walked along, in order, ending at a saved record. */
export const TIPS = [
  {
    key: 'add-vehicle-identity',
    match: (path) => path === '/register/vehicle' || path === '/vehicles/new',
    anchor: 'vehicle-identity',
    title: 'Start with make and model',
    body: 'Search your brand, then your model. Where Trevora knows the model it fills in the body type for you; otherwise you pick it just below.',
  },
  {
    key: 'add-vehicle-photo',
    match: (path) => path === '/register/vehicle' || path === '/vehicles/new',
    anchor: 'vehicle-photo',
    title: 'A photo helps you',
    body: 'Optional, and only for telling your vehicles apart at a glance once you have more than one.',
  },
  /* Three tips, not one over the group. The cards are a row on a desktop and a
     column on a phone, and most people here are on a phone -- a single
     spotlight over all three would be taller than the screen, leaving the card
     that explains it nowhere to sit.

     `input-method-choice` keeps its original key: it was already recorded as
     seen for existing accounts by migration 022, and renaming it would show it
     to all of them again. */
  {
    key: 'input-method-choice',
    match: (path) => path.startsWith('/service-input'),
    anchor: 'method-receipt',
    title: 'Photograph the receipt',
    body: 'The quickest way in. Trevora reads the details off the paper, and multi-page receipts are fine.',
  },
  {
    key: 'input-method-voice',
    match: (path) => path.startsWith('/service-input'),
    anchor: 'method-voice',
    title: 'Or just say it',
    body: 'No receipt to hand? Talk through what was done and Trevora writes it down for you.',
  },
  {
    key: 'input-method-manual',
    match: (path) => path.startsWith('/service-input'),
    anchor: 'method-manual',
    title: 'Or type it yourself',
    body: 'Best for an old service you already know. Nothing is read or guessed — what you type is what saves.',
  },
  {
    key: 'receipt-capture',
    match: (path) => path.includes('/receipt'),
    anchor: 'receipt-capture',
    title: 'Take or upload the pages',
    body: 'Add every page of the receipt. A clearer photo reads better, and you can retake any page that comes out blurry.',
  },
  {
    key: 'voice-record',
    match: (path) => path.includes('/voice'),
    anchor: 'voice-record',
    title: 'Say what was done',
    body: 'Talk through the visit in your own words — what was done, where, and what it cost. You can edit everything afterwards.',
  },
  {
    key: 'manual-entry',
    match: (path) => path.includes('/manual'),
    anchor: 'manual-fields',
    title: 'Only two are required',
    body: 'The date and the total. Everything else is worth filling in when you know it, and can be added later when you do not.',
  },
  /* The part of this page nobody works out on their own. The heading above it
     says what it is, not what it is for -- a total says how much the visit
     cost, and only the lines say what the money actually bought. */
  {
    key: 'manual-lines',
    match: (path) => path.includes('/manual'),
    anchor: 'manual-lines',
    title: 'What the money bought',
    body: 'Add a line for each charge — parts, labour, materials. Without them the record keeps the total and forgets what it was for.',
  },
  {
    key: 'draft-review-confirm',
    match: (path) => path.startsWith('/service-drafts'),
    anchor: 'draft-confirm',
    title: 'Nothing is saved yet',
    body: 'Check the details Trevora read, correct anything wrong, then confirm. Until you do, this is not in your history.',
  },
  /* The page below this control explains what sharing is and what it does
     not do, and explains it well -- so this says the one thing the page does
     not: that this button is where it starts, and that the requests it
     produces come back to this same screen for you to answer. */
  {
    key: 'shared-access-start',
    match: (path) => path === '/access/requests',
    anchor: 'share-start',
    title: 'Sharing starts here',
    body: 'Pick a vehicle and Trevora makes a QR code. A mechanic scans it to ask for access, and the request comes back to this page for you to approve or deny.',
  },
  {
    key: 'record-share',
    match: (path) => /^\/vehicles\/[^/]+\/history\/[^/]+$/.test(path),
    anchor: 'record-share',
    title: 'Show this to a mechanic',
    body: 'Share history creates a code a mechanic can scan to read this vehicle only, for a few hours, without an account.',
  },
];

/** The tips for one screen, in registry order, minus the ones already seen. */
export function tipsForPath(path, seenKeys) {
  return TIPS.filter((tip) => tip.match(path) && !seenKeys.has(tip.key));
}
