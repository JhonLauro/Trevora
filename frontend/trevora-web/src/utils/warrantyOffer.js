/**
 * What a receipt's printed warranty period has to say to this vehicle.
 *
 * <p>Built the same way as the plate and VIN offer: the extraction stores what
 * the paper printed in the draft's metadata, and nothing reaches the vehicle
 * without the owner's click. Unlike a plate, a disagreement is not a warning
 * that the receipt belongs to another car. Different warranty dates usually
 * mean a typo or an extended warranty, so a conflict is a quiet card with the
 * vehicle's own dates kept unless the owner picks the receipt's.
 *
 * <p>The vehicle's side is what its warranty tab shows: the start date as
 * entered and the end date the resolver used, printed or worked out.
 *
 * @returns null when there is nothing to say; `{ kind: 'offer', start, end }`
 *     when the vehicle has no dates; `{ kind: 'conflict', start, end,
 *     recordedStart, recordedEnd }` when a date both sides have differs
 */
export function readWarrantyOffer(draft, vehicle) {
  if (!draft || !vehicle) return null;
  const metadata = draft.fieldMetadata ?? {};
  const start = isoDate(metadata.receiptWarrantyStartDate);
  const end = isoDate(metadata.receiptWarrantyExpiryDate);
  if (!start && !end) return null;

  const recordedStart = isoDate(vehicle.warranty?.startDate);
  const recordedEnd = isoDate(vehicle.warranty?.expiryDate);

  // Only a date both sides have can disagree.
  const startsDiffer = Boolean(start && recordedStart && start !== recordedStart);
  const endsDiffer = Boolean(end && recordedEnd && end !== recordedEnd);
  if (startsDiffer || endsDiffer) {
    return { kind: 'conflict', start, end, recordedStart, recordedEnd };
  }

  /* Nothing disagrees, but the receipt may still fill a gap: a vehicle with a
     start date and no period has no end date, and the paper prints one. That
     is an offer, not agreement -- saying nothing would leave the warranty tab
     reading "incomplete" while the answer sits in the record's metadata. */
  const fillsStart = Boolean(start && !recordedStart);
  const fillsEnd = Boolean(end && !recordedEnd);
  if (fillsStart || fillsEnd) {
    return { kind: 'offer', start, end };
  }
  return null;
}

/**
 * The PATCH body for accepting the receipt's dates.
 *
 * <p>Only the dates the receipt printed. Sending a null for the other one
 * would erase a date the owner had and the paper never contradicted.
 */
export function warrantyOfferPatch(offer) {
  const body = { warrantySource: 'RECEIPT' };
  if (offer.start) body.warrantyStartDate = offer.start;
  if (offer.end) body.warrantyExpiryDate = offer.end;
  return body;
}

function isoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * What the Saved page says after a receipt filled the vehicle's warranty dates.
 *
 * <p>The period comes from the vehicle as it now stands, so a receipt that
 * filled only the end date still shows the start the owner typed. The status
 * line comes from the warranty the backend resolved: ended, or running until
 * the end date. Anything else, such as a period with no end, gets no line.
 *
 * @param update the confirmation response's `warrantyUpdate`, or undefined
 * @returns null when nothing was filled
 */
export function warrantyNotice(update, vehicle) {
  if (!update || (!isoDate(update.startDate) && !isoDate(update.expiryDate))) return null;
  const warranty = vehicle?.warranty ?? {};
  const start = isoDate(warranty.startDate) ?? isoDate(update.startDate);
  const end = isoDate(warranty.expiryDate) ?? isoDate(update.expiryDate);

  let status = null;
  if (end && warranty.status === 'EXPIRED') {
    status = { key: 'warrantyNotice.ended', date: end, tone: 'ended' };
  } else if (end && ['ACTIVE', 'TIME_ONLY', 'MILEAGE_ONLY'].includes(warranty.status)) {
    status = { key: 'warrantyNotice.until', date: end, tone: 'ok' };
  }
  return { start, end, status };
}
