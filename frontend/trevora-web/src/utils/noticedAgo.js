/**
 * How long ago something was noticed, in words.
 *
 * A mechanic reads "3 weeks ago" and "yesterday" differently: one is a
 * complaint that has had time to get worse, the other is what brought the car
 * in. An absolute date makes them do that arithmetic themselves, standing next
 * to the vehicle, which is exactly when they will not.
 *
 * Deliberately coarse. Nothing here is precise to the hour, and pretending
 * otherwise ("2 hours 40 minutes ago") reads as data rather than as context.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function noticedAgo(value, now = Date.now()) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';

  const elapsed = now - then;
  // A clock skewed a few minutes ahead should read as "just now", not as a
  // negative age or a date in the future.
  if (elapsed < HOUR) return 'just now';
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }
  if (elapsed < 2 * DAY) return 'yesterday';
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)} days ago`;
  if (elapsed < 5 * WEEK) {
    const weeks = Math.floor(elapsed / WEEK);
    return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
  }
  const months = Math.floor(elapsed / (30 * DAY));
  if (months < 12) return months === 1 ? 'a month ago' : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}
