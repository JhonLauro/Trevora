/**
 * Turning a warranty block into lines of text.
 *
 * <p>No arithmetic happens here. Status, expiry date and kilometres remaining
 * are all worked out by `WarrantyStatusResolver` on the backend, because a
 * mechanic reading a shared history and the owner reading their own page must
 * never be told different things about the same car — and the mechanic's page
 * cannot import a helper from the owner's. This file decides only how the
 * answer reads.
 *
 * <p>Every function returns `{ key, vars }` rather than a finished string, so
 * the copy can be translated at render and tested here without a language
 * provider mounted.
 *
 * <p>The partial states are the reason this is more than a ternary. A vehicle
 * whose purchase date is missing is not "covered" and not "expired"; it is a
 * vehicle we can check one of two limits on, and the line has to say which one
 * it could not check. Anything that reads as a confident verdict on half the
 * evidence is the failure this feature is trying not to be.
 */
import { formatDate, formatKilometres } from './format';

/** Nothing recorded at all — the tab shows its offer to collect the terms. */
export function isWarrantyUnset(warranty) {
  return !warranty || warranty.status === 'NOT_SET';
}

/** Recorded, but neither limit can be evaluated from what is there. */
export function isWarrantyIncomplete(warranty) {
  return warranty?.status === 'INCOMPLETE';
}

/**
 * The heading.
 *
 * <p>"Ending soon" outranks "under warranty" for the same reason the backend
 * keeps that flag separate from the status: a car with three thousand
 * kilometres left is still covered, and saying only that is technically true
 * and useless to somebody deciding where to book their next service.
 */
export function warrantyTitleKey(warranty) {
  switch (warranty?.status) {
    case 'EXPIRED':
      return 'warranty.ended';
    case 'INCOMPLETE':
      return 'warranty.incomplete';
    case 'ACTIVE':
    case 'MILEAGE_ONLY':
    case 'TIME_ONLY':
      return warranty.expiringSoon ? 'warranty.endingSoon' : 'warranty.covered';
    default:
      return 'warranty.empty.title';
  }
}

/** ok / warn / ended — drives the badge, and nothing else in the app may use colour for anything but status. */
export function warrantyTone(warranty) {
  switch (warranty?.status) {
    case 'EXPIRED':
      return 'ended';
    case 'INCOMPLETE':
      return 'unknown';
    case 'ACTIVE':
    case 'MILEAGE_ONLY':
    case 'TIME_ONLY':
      return warranty.expiringSoon ? 'warn' : 'ok';
    default:
      return 'unknown';
  }
}

/**
 * What the cover runs to.
 *
 * <p>"whichever comes first" appears only when both limits are actually known.
 * On a vehicle with one of them it would be describing a race with one runner,
 * and worse, it would imply the other limit had been checked.
 */
export function warrantyLimitLine(warranty) {
  if (!warranty) return null;
  const hasDate = Boolean(warranty.expiryDate);
  const hasKm = warranty.kmLimit != null;

  if (hasDate && hasKm) {
    return {
      key: 'warranty.limits.both',
      vars: { date: formatDate(warranty.expiryDate), km: formatKilometres(warranty.kmLimit) },
    };
  }
  if (hasDate) {
    return { key: 'warranty.limits.timeOnly', vars: { date: formatDate(warranty.expiryDate) } };
  }
  if (hasKm) {
    return { key: 'warranty.limits.kmOnly', vars: { km: formatKilometres(warranty.kmLimit) } };
  }
  return null;
}

/**
 * The distance line.
 *
 * <p>Three shapes, because "57,700 km remaining" is wrong once the limit has
 * been passed and meaningless when there is no limit to measure against. A
 * vehicle over its limit is told by how much: that number is the difference
 * between a warranty that lapsed last week and one that lapsed two owners ago.
 */
export function warrantyDistanceLine(warranty) {
  if (!warranty || warranty.currentKm == null) return null;
  const current = formatKilometres(warranty.currentKm);

  if (warranty.kmLimit == null) {
    return { key: 'warranty.distance.recorded', vars: { current } };
  }
  if (warranty.kmRemaining != null && warranty.kmRemaining <= 0) {
    return {
      key: 'warranty.distance.over',
      vars: {
        current,
        over: formatKilometres(Math.abs(warranty.kmRemaining)),
        limit: formatKilometres(warranty.kmLimit),
      },
    };
  }
  return {
    key: 'warranty.distance.remaining',
    vars: { current, remaining: formatKilometres(warranty.kmRemaining) },
  };
}

/**
 * What could not be checked, and why.
 *
 * <p>This is the honest half of a partial state and the reason the status enum
 * has partial values at all. Without it MILEAGE_ONLY renders as an ordinary
 * "under warranty" and quietly claims a time limit was verified when no
 * purchase date exists to verify it against.
 *
 * <p>Returns every gap, not the first: a vehicle can be missing the purchase
 * date and the mileage limit both, and naming one of them would send the owner
 * back to fill in half of what is needed.
 */
export function warrantyGapLines(warranty) {
  if (!warranty || warranty.status === 'NOT_SET') return [];
  const gaps = [];

  if (!warranty.expiryDate) {
    gaps.push(warranty.startDate == null
      ? { key: 'warranty.gap.noStartDate', vars: {} }
      : { key: 'warranty.gap.noMonths', vars: {} });
  }
  if (warranty.kmLimit == null) {
    gaps.push({ key: 'warranty.gap.noKmLimit', vars: {} });
  } else if (warranty.currentKm == null) {
    gaps.push({ key: 'warranty.gap.noOdometer', vars: {} });
  }
  return gaps;
}

/**
 * Which limit ended the cover, when it has ended.
 *
 * <p>Both can be past, and then both are named. "Whichever comes first" is a
 * rule about when cover stops, not a licence to report only one reason —
 * an owner told their warranty ran out on a date, when it had in fact run out
 * twenty thousand kilometres earlier, would draw the wrong conclusion about
 * every other vehicle they own.
 */
export function warrantyEndedReasons(warranty) {
  if (warranty?.status !== 'EXPIRED') return [];
  const reasons = [];

  if (warranty.daysRemaining != null && warranty.daysRemaining <= 0 && warranty.expiryDate) {
    reasons.push({ key: 'warranty.ended.byDate', vars: { date: formatDate(warranty.expiryDate) } });
  }
  if (warranty.kmRemaining != null && warranty.kmRemaining <= 0 && warranty.kmLimit != null) {
    reasons.push({
      key: 'warranty.ended.byDistance',
      vars: { limit: formatKilometres(warranty.kmLimit) },
    });
  }
  return reasons;
}

/**
 * Whether the owner has entered anything at all worth editing rather than adding.
 *
 * <p>Drives one button's wording. "Add warranty info" on a vehicle that
 * already has terms recorded reads as though the app lost them.
 */
export function hasWarrantyTerms(warranty) {
  return Boolean(warranty) && warranty.status !== 'NOT_SET';
}
