import React, { useEffect, useState } from 'react';
import { Sparkles, TriangleAlert } from 'lucide-react';
import { getServiceRecordAIExplanation } from '../api/aiExplanations';

/**
 * The plain-language explanation of one confirmed record.
 *
 * <p>Rebuilt off the pre-Ink classes in styles.css (`ai-explanation-card`,
 * `button-secondary`, `muted`), which is why it was the one panel on the
 * record page still wearing the old product's paint.
 *
 * <p>It also used to parse. `AIExplanationService` concatenated the parts,
 * materials, labour and cost onto the end of `whatWasDone` as prose, and this
 * component split the sentence back apart to display them. That went wrong
 * twice — first on the delimiter (the server joins with "; ", the split
 * looked for ", "), then on a shop name, where "Toyota Otis, Manila" became
 * two items and every guard passed.
 *
 * <p>Both heuristics are gone. The API returns `details` — a list of
 * `{ label, values }` — and this renders it. If a response arrives without
 * that field the sentence is simply shown as written, which is the correct
 * behaviour for a client that no longer pretends to know how prose was built.
 *
 * <p>There is deliberately no Regenerate button. Every press is another
 * model call on a shared budget, and the second answer is not better than
 * the first — only different. The one retry left is inside the error state,
 * where nothing was produced to keep.
 */

function DetailValues({ values }) {
  if (values.length === 1) return values[0];

  return (
    <ul className="aiex__items">
      {/* Index keys: a receipt can legitimately list the same line twice, and
          the value is all we have to tell them apart. */}
      {values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}
    </ul>
  );
}

export default function AIExplanationPanel({ recordId }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!recordId) return undefined;

    let active = true;
    setLoading(true);
    setError('');

    getServiceRecordAIExplanation(recordId)
      .then((data) => {
        if (active) setExplanation(data);
      })
      .catch((err) => {
        if (!active) return;
        setExplanation(null);
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [recordId, reloadKey]);

  const watchFor = explanation?.watchFor ?? [];
  const details = (explanation?.details ?? []).filter((d) => d?.values?.length);

  return (
    <section className="ink-card aiex" aria-live="polite">
      <div className="aiex__head">
        <h2 className="ink-section-title">
          <Sparkles size={18} aria-hidden="true" />
          In plain language
        </h2>
      </div>

      {loading && <p className="aiex__note">Putting this record into plain language…</p>}

      {error && !loading && (
        <div className="aiex__unavailable">
          <p className="aiex__unavailable-title">No explanation right now</p>
          <p className="aiex__note">{error}</p>
          <button
            className="aiex__refresh aiex__refresh--inline"
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {explanation && !loading && !error && (
        <div className="aiex__body">
          {/* Said once, quietly, and only when it applies. It used to be a
              boxed warning that looked like something had gone wrong. */}
          {explanation.fallback && (
            <p className="aiex__fallback">
              Written from the record itself rather than by the explanation service.
            </p>
          )}

          <section className="aiex__section">
            <h3 className="aiex__section-title">What was done</h3>
            <p className="aiex__prose">{explanation.whatWasDone}</p>
            {details.length > 0 && (
              <dl className="aiex__facts">
                {details.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd><DetailValues values={detail.values} /></dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="aiex__section">
            <h3 className="aiex__section-title">Why it matters</h3>
            <p className="aiex__prose">{explanation.whyItMatters}</p>
          </section>

          {watchFor.length > 0 && (
            <section className="aiex__section">
              <h3 className="aiex__section-title">
                <TriangleAlert size={15} aria-hidden="true" />
                What to watch for
              </h3>
              <ul className="aiex__watch">
                {watchFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {explanation.disclaimer && (
            <p className="aiex__disclaimer">{explanation.disclaimer}</p>
          )}
        </div>
      )}
    </section>
  );
}
