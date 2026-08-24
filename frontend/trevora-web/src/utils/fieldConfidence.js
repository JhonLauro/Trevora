// --- What we can say about one field, said one way ---
//
// This was implemented four times, once per screen, and the four disagreed:
// the same extracted field read "Extracted from receipt" on the draft view,
// "High 82%" on review, and "Reviewed" on confirmation. An owner cannot learn
// to read a badge that means something different one screen later.
//
// The percentages are gone with the numeric confidence they came from — see
// FieldValidationIssue on the backend. Extraction reports confidence
// categorically, and a category is what an owner can act on anyway: "check
// this one" is a task, "82%" is trivia.

/** The provenance the extractor recorded for one field, or null. */
export function fieldEvidence(draft, fieldName) {
  const metadata = draft?.fieldMetadata ?? {};
  const source = metadata.fieldSources?.[fieldName];
  const confidence = metadata.fieldConfidence?.[fieldName];

  if (source && typeof source === 'object') {
    return {
      sourceType: source.sourceType,
      confidence: source.confidence || confidence,
      sourceText: source.sourceText,
      pageNumber: source.pageNumber,
      needsReview: Boolean(source.needsReview),
    };
  }
  if (source || confidence) {
    return {
      sourceType: source ? 'EXTRACTED_FROM_TEXT' : undefined,
      confidence,
      // A voice draft records the string "voice transcript" here rather than an
      // evidence object. That is a provenance note, not a quote from the
      // receipt, so it must not be shown as one.
      sourceText: undefined,
      needsReview: confidence === 'low' || confidence === 'not_found',
    };
  }
  return null;
}

/**
 * A real quote from the source, or ''.
 *
 * <p>Never a description of how the code works. An earlier version filled the
 * gap with static sentences — "Mapped from total or amount paid" — rendered in
 * the same place and style as genuine evidence, so a sentence about the
 * pipeline was indistinguishable from a line off the owner's receipt.
 */
export function sourceQuote(evidence) {
  if (!evidence?.sourceText) return '';
  const page = evidence.pageNumber ? `Page ${evidence.pageNumber}: ` : '';
  return `${page}${String(evidence.sourceText)}`;
}

/**
 * The one signal for one field: a status for styling, a label to render, and
 * the source quote when there is one.
 *
 * <p>An ordered ladder, most urgent first. A field that cannot be saved says
 * so; only once there is nothing wrong does it describe where the value came
 * from.
 *
 * @param issue the validation issue for this field, if any
 * @param value the value currently in the form, which is not the draft's value
 *     once the owner starts typing
 */
export function fieldSignal({ draft, fieldName, value, issue }) {
  const evidence = fieldEvidence(draft, fieldName);
  const quote = sourceQuote(evidence);
  const filled = value !== null && value !== undefined && String(value).trim() !== '';

  const signal = (status, label) => ({ status, label, quote });

  // 1. Cannot be saved as it stands.
  if (issue?.blocksConfirmation) {
    return issue.category === 'MISSING_REQUIRED'
      ? signal('low', 'Needed to save')
      : signal('low', 'Cannot be right');
  }

  // 2. The source said two different things.
  if (evidence?.sourceType === 'CONFLICTING' || issue?.category === 'UNCERTAIN') {
    return signal('low', 'Two different values found');
  }

  // 3. The source never said it.
  if (evidence?.confidence === 'not_found' || issue?.category === 'NOT_FOUND') {
    return signal(filled ? 'low' : 'medium', filled ? 'Check this one' : 'Not on receipt');
  }

  // 4. Read, but not confidently.
  if (evidence?.confidence === 'low' || evidence?.needsReview || issue?.requiresReview) {
    return signal('low', 'Check this one');
  }

  // 5. Worked out rather than read off.
  if (evidence?.sourceType === 'INFERRED_FROM_TEXT' || evidence?.sourceType === 'EXTRACTED_AND_SUMMARIZED') {
    return signal('source', 'Read between the lines');
  }

  // 6. Read cleanly.
  if (evidence?.sourceType === 'EXTRACTED_FROM_TEXT' && filled) {
    return signal('high', draft?.inputMethod === 'VOICE' ? 'Heard in your note' : 'Read from receipt');
  }

  // 7. Nobody extracted it, so the owner typed it.
  if (filled && draft?.inputMethod === 'MANUAL') {
    return signal('owner', 'You entered this');
  }

  return signal(null, '');
}

/** The issue for each field, blocking problems winning over warnings. */
export function issuesByField(validation) {
  const issues = new Map();
  for (const issue of validation?.flaggedFields ?? []) {
    issues.set(issue.fieldName, issue);
  }
  // Blocking last, so a field that is both flagged and blocking reports the
  // blocking problem — the one that stops the owner saving.
  for (const issue of validation?.invalidFields ?? []) {
    issues.set(issue.fieldName, issue);
  }
  for (const issue of validation?.missingRequiredFields ?? []) {
    issues.set(issue.fieldName, issue);
  }
  return issues;
}

/**
 * How many fields the owner is being asked to look at.
 *
 * <p>Counted by field, not by issue. One field can carry two — a total that is
 * both blank and was read with low confidence — and that is one thing to fix,
 * not two. Counting issues inflated the number on exactly the drafts that
 * needed the most attention, where it mattered most that the count was
 * believable.
 *
 * <p>An empty odometer is not counted at all: plenty of receipts never print
 * one, and treating that as a problem made almost every draft look like work.
 */
export function attentionCount(validation, form = {}) {
  const fields = new Set();
  for (const issue of validation?.missingRequiredFields ?? []) {
    fields.add(issue.fieldName);
  }
  for (const issue of validation?.invalidFields ?? []) {
    fields.add(issue.fieldName);
  }
  for (const issue of validation?.flaggedFields ?? []) {
    if (issue.requiresReview && !isBlankOptionalField(issue, form)) {
      fields.add(issue.fieldName);
    }
  }
  return fields.size;
}

export function isBlankOptionalField(issue, form = {}) {
  return issue?.fieldName === 'odometer' && !String(form.odometer ?? issue.currentValue ?? '').trim();
}
