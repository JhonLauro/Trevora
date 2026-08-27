import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { getServiceRecordAIExplanation } from '../api/aiExplanations';

/**
 * The plain-language explanation of one confirmed record.
 *
 * <p>Rebuilt off the pre-Ink classes in styles.css (`ai-explanation-card`,
 * `button-secondary`, `muted`), which is why it was the one panel on the
 * record page still wearing the old product's paint.
 *
 * <p>The other half of the problem was the copy, not the paint.
 * `AIExplanationService` builds "what was done" by concatenating sentences
 * into one string — "…completed on 7 May 2026 at Toyota Otis. Parts noted:
 * oil filter, brake pads. Materials used: … Work performed: … Total recorded
 * cost: …" — so the four facts an owner actually scans for were buried in a
 * run-on paragraph. `splitStatements` below breaks it back apart at sentence
 * boundaries and promotes any "Label: value" sentence to a labelled row.
 *
 * <p>That is deliberately a presentational split and nothing more. It invents
 * no structure: a sentence without a colon stays a sentence, so a freeform
 * answer from the model degrades to ordinary prose rather than to nonsense.
 * The real fix is for the API to return those as fields; see DEFERRED.md.
 */

/* A leading label is a short capitalised phrase before a colon — "Parts
   noted:", "Total recorded cost:". Capped at four words so a sentence that
   merely contains a colon is not mistaken for one. */
const LABELLED = /^([A-Z][^:]{2,40}):\s*(.+)$/;

/* `joinItemField` and `lineEntriesOfKind` on the server both reduce with
   `first + "; " + second`, so several parts, materials or operations arrive
   glued into one value: "JLLY SYNTHETIC ENGINE OIL; OIL FILTER; DRAIN PLUG
   WASHER; BRAKE PASTE; …". Seven things wearing one label, set as a paragraph.

   The semicolon is the delimiter the server actually uses and it is
   unambiguous — a part name does not contain one — so the split needs no
   guard beyond finding two pieces.

   There was a comma branch here as well, on the theory that some values might
   be comma-joined. It is gone. Testing it against "Toyota Otis, Manila"
   showed it splitting a single shop into two items: both halves are short and
   neither contains " and ", so every guard passed and the result was still
   wrong. A heuristic that cannot tell a list from a place name has no business
   guessing, and nothing on the server produces comma-joined items anyway. */
function splitItems(value) {
  if (!value.includes(';')) return null;
  const items = value.split(';').map((item) => item.trim()).filter(Boolean);
  return items.length > 1 ? items : null;
}

function splitStatements(text) {
  if (!text) return [];

  return String(text)
    // Split after a full stop followed by a space and a capital, so decimals
    // and abbreviations inside a value are left alone.
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((sentence) => {
      const match = LABELLED.exec(sentence.replace(/\.$/, ''));
      if (!match) return { kind: 'prose', text: sentence };
      return { kind: 'fact', label: match[1], value: match[2] };
    });
}

function Statements({ text }) {
  const parts = useMemo(() => splitStatements(text), [text]);
  if (!parts.length) return null;

  const prose = parts.filter((p) => p.kind === 'prose');
  const facts = parts.filter((p) => p.kind === 'fact');

  return (
    <>
      {prose.map((p) => (
        <p className="aiex__prose" key={p.text}>{p.text}</p>
      ))}
      {facts.length > 0 && (
        <dl className="aiex__facts">
          {facts.map((f) => {
            const items = splitItems(f.value);
            return (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>
                  {items
                    ? (
                      <ul className="aiex__items">
                        {/* Index keys: a receipt can legitimately list the
                            same line twice, and the value is all we have. */}
                        {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                      </ul>
                    )
                    : f.value}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </>
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

  return (
    <section className="ink-card aiex" aria-live="polite">
      <div className="aiex__head">
        <h2 className="ink-section-title">
          <Sparkles size={18} aria-hidden="true" />
          In plain language
        </h2>
        <button
          className="aiex__refresh"
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? 'Working…' : 'Regenerate'}
        </button>
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
            <Statements text={explanation.whatWasDone} />
          </section>

          <section className="aiex__section">
            <h3 className="aiex__section-title">Why it matters</h3>
            <Statements text={explanation.whyItMatters} />
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
