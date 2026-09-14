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
  if (!recordedStart && !recordedEnd) {
    return { kind: 'offer', start, end };
  }

  // A date only one side has is not a disagreement.
  const startsAgree = !start || !recordedStart || start === recordedStart;
  const endsAgree = !end || !recordedEnd || end === recordedEnd;
  if (startsAgree && endsAgree) return null;
  return { kind: 'conflict', start, end, recordedStart, recordedEnd };
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
