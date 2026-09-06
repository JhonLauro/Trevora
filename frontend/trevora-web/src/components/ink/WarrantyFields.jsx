import React from 'react';
import { useT } from '../../i18n/index.jsx';

/**
 * The three manufacturer warranty terms, as a group of inputs.
 *
 * <p>Used by `EditWarrantyDialog` and nowhere else today. It stays a separate
 * component rather than being inlined there because the field list, the
 * placeholders and the booklet line are the part worth having in one place if
 * these ever appear on a second surface — and because the dialog is then about
 * opening, validating and saving rather than about markup.
 *
 * <p><b>Deliberately not on the add-a-vehicle form, and not in the vehicle
 * details dialog.</b> Both were tried. Registration fields are read off the
 * vehicle by somebody holding it; these come out of a booklet in a drawer, and
 * a field you have to leave the screen to answer does not belong in a form
 * somebody is trying to finish.
 *
 * <p><b>Nothing is prefilled, and that is a decision rather than an omission.</b>
 * Three years and 100,000 km is the common PH-market warranty and it is wrong
 * often enough to matter — terms vary by brand, by model year and by market.
 * A prefilled 36 that nobody read looks exactly like a 36 somebody checked, and
 * the whole point of this feature is telling an owner something they can act
 * on. The helper text states the common terms as a prompt to go and look,
 * which is the useful version of the same information.
 */
export const WARRANTY_FIELDS = ['warrantyStartDate', 'warrantyMonths', 'warrantyKmLimit'];

/**
 * Form strings from a saved vehicle.
 *
 * <p>Empty strings, not nulls: an input whose value is null is uncontrolled,
 * and React will not let it become controlled later without a warning and a
 * lost keystroke. A vehicle with no terms recorded opens on three blank boxes,
 * which is also what a new one should look like.
 */
export function warrantyFormValues(vehicle) {
  return {
    warrantyStartDate: vehicle?.warranty?.startDate ?? '',
    warrantyMonths: vehicle?.warranty?.months == null ? '' : String(vehicle.warranty.months),
    warrantyKmLimit: vehicle?.warranty?.kmLimit == null ? '' : String(vehicle.warranty.kmLimit),
  };
}

/**
 * The three fields as the API takes them.
 *
 * <p>Exactly three keys, which is what a PATCH body should be — the endpoint
 * leaves untouched anything the body does not name, so nothing else has to be
 * sent along to protect it.
 *
 * <p>An emptied field is a null rather than an omission. Dropping the key would
 * mean the server kept the old value, and a purchase date typed by mistake
 * could never be taken back out.
 */
export function warrantyPayload(form) {
  const number = (value) => {
    const trimmed = String(value ?? '').trim().replace(/[\s,]/g, '');
    return trimmed ? Number(trimmed) : null;
  };
  return {
    warrantyStartDate: String(form.warrantyStartDate ?? '').trim() || null,
    warrantyMonths: number(form.warrantyMonths),
    warrantyKmLimit: number(form.warrantyKmLimit),
  };
}

export default function WarrantyFields({
  form,
  errors = {},
  refs = {},
  onChange,
  disabled = false,
}) {
  const t = useT();

  const fields = [
    {
      name: 'warrantyStartDate',
      label: t('warranty.field.startDate'),
      hint: t('warranty.field.startDateHint'),
      type: 'date',
    },
    {
      name: 'warrantyMonths',
      label: t('warranty.field.months'),
      placeholder: t('warranty.field.monthsPlaceholder'),
      inputMode: 'numeric',
    },
    {
      name: 'warrantyKmLimit',
      label: t('warranty.field.kmLimit'),
      placeholder: t('warranty.field.kmLimitPlaceholder'),
      inputMode: 'numeric',
    },
  ];

  /* A fieldset with no legend: the dialog's own heading names the group, and a
     caption repeating it would be the same words twice above three rows. The
     grouping is still worth having for a screen reader. */
  return (
    <fieldset className="warranty-fields">

      {fields.map((field) => {
        const errorId = `${field.name}-error`;
        return (
          <div className="ink-combo" key={field.name}>
            <label className="ink-combo__label" htmlFor={field.name}>{field.label}</label>
            {field.hint && <p className="ink-combo__hint" id={`${field.name}-hint`}>{field.hint}</p>}
            <input
              id={field.name}
              name={field.name}
              ref={refs[field.name]}
              type={field.type ?? 'text'}
              inputMode={field.inputMode}
              placeholder={field.placeholder}
              value={form[field.name] ?? ''}
              disabled={disabled}
              aria-invalid={errors[field.name] ? true : undefined}
              aria-describedby={[
                field.hint ? `${field.name}-hint` : null,
                errors[field.name] ? errorId : null,
                'warranty-booklet-help',
              ].filter(Boolean).join(' ')}
              onChange={onChange}
            />
            {errors[field.name] && (
              <p className="ink-combo__error" id={errorId}>{errors[field.name]}</p>
            )}
          </div>
        );
      })}

      {/* Under all three rather than on one of them: it is the answer to
          "what do I put here" for the whole section, and every field points at
          it through aria-describedby so it is read out rather than seen only. */}
      <p className="warranty-fields__help" id="warranty-booklet-help">
        {t('warranty.field.help')}
      </p>
    </fieldset>
  );
}
