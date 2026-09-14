/**
 * The three things in the Terms and the Privacy Policy that are not facts
 * about the software, and that only you can fill in.
 *
 * They live here rather than inline in the two pages so that filling them in
 * is one edit rather than a hunt through prose, and so that a placeholder
 * cannot be left in one document while being fixed in the other.
 *
 * `LEGAL_CONTACT` is real (set 2026-09-14). `LEGAL_ENTITY` is still a
 * PLACEHOLDER: "the Trevora team" is not a person or company that can answer
 * for the data under the Data Privacy Act. Neither document has been read by
 * somebody qualified.
 */

/** The person or company that operates Trevora and answers for the data. */
export const LEGAL_ENTITY = 'the Trevora team';

/** A mailbox that is actually monitored — data requests and account closures
 *  arrive here, and the Privacy Policy promises a reply within thirty days. */
export const LEGAL_CONTACT = 'trevoradomain@gmail.com';

/** Shown at the top of both documents. Update it whenever either changes. */
export const LEGAL_UPDATED = '14 September 2026';
