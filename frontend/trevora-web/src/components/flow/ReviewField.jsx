import React from 'react';
import { fieldSignal, isBlankOptionalField } from '../../utils/fieldConfidence';
import { TIER_BLOCKING, TIER_REVIEW, tierClass, tierFor } from '../../utils/fieldTier';

/**
 * One field on the checking screen, drawn at its tier.
 *
 * <p>The badge wording comes from {@link fieldSignal} and is not touched here
 * — it is the same string the confirm screen prints, which is the whole reason
 * that function exists. What this adds is the tier: containment rather than
 * hue, so seven states fit inside a palette that only lets colour mean status.
 *
 * <p>Order below the input is deliberate: what is wrong, then why, then what
 * the machine actually read. The quote is last because it is evidence for the
 * other two, and it is set in the mono face so it can never be mistaken for a
 * sentence the product wrote.
 */
export default function ReviewField({
  field,
  form,
  draft,
  issue,
  updateField,
  fieldId,
}) {
  const [key, label, type, required] = field;
  const value = form[key] ?? '';
  const visibleIssue = isBlankOptionalField(issue, form) ? null : issue;
  const signal = fieldSignal({ draft, fieldName: key, value, issue: visibleIssue });
  const tier = tierFor(signal);

  const badgeClass = tier === TIER_BLOCKING
    ? 'flow-badge--1'
    : tier === TIER_REVIEW ? 'flow-badge--2' : 'flow-badge--3';

  return (
    <div
      className={`flow-review-field flow-rail-target ${tierClass(tier)}`.trim()}
      id={fieldId}
    >
      <label className="flow-review-field__head" htmlFor={`${fieldId}-input`}>
        <span className="flow-review-field__label">
          {label}
          {required ? ' *' : ''}
        </span>
        {signal.label && <span className={badgeClass}>{signal.label}</span>}
      </label>

      {type === 'textarea' ? (
        <textarea
          id={`${fieldId}-input`}
          name={key}
          value={value}
          onChange={updateField}
          rows="3"
        />
      ) : (
        <input
          id={`${fieldId}-input`}
          name={key}
          type={type}
          min={type === 'number' ? '0' : undefined}
          step={key === 'totalCost' ? '0.01' : undefined}
          value={value}
          onChange={updateField}
        />
      )}

      {/* Tier 1 states say what is wrong in the same red as the border. Tier 2
          states explain themselves in muted text — they are a judgement call,
          not an error. */}
      {tier === TIER_BLOCKING && visibleIssue?.message && (
        <p className="flow-review-field__blocking">{visibleIssue.message}</p>
      )}
      {tier === TIER_REVIEW && visibleIssue?.message && (
        <p className="flow-review-field__why">{visibleIssue.message}</p>
      )}

      {signal.quote && <p className="flow-quote">{signal.quote}</p>}
    </div>
  );
}

/** The tier a field would render at, for counting without rendering it. */
export function signalFor(draft, form, key, issue) {
  const visibleIssue = isBlankOptionalField(issue, form) ? null : issue;
  return fieldSignal({ draft, fieldName: key, value: form[key] ?? '', issue: visibleIssue });
}
