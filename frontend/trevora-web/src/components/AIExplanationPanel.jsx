import React, { useEffect, useState } from 'react';
import { getServiceRecordAIExplanation } from '../api/aiExplanations';

export default function AIExplanationPanel({ recordId }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!recordId) return;

    let active = true;
    setLoading(true);
    setError('');

    getServiceRecordAIExplanation(recordId)
      .then((data) => {
        if (!active) return;
        setExplanation(data);
      })
      .catch((err) => {
        if (!active) return;
        setExplanation(null);
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [recordId, reloadKey]);

  return (
    <section className="ai-explanation-card" aria-live="polite">
      <div className="ai-explanation-header">
        <div>
          <h2>AI Explanation</h2>
        </div>
        <button
          className="button-secondary ai-refresh-button"
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={loading}
        >
          Regenerate
        </button>
      </div>

      {loading && <p className="muted">Generating owner-friendly explanation...</p>}

      {error && !loading && (
        <div className="ai-explanation-unavailable">
          <strong>Explanation unavailable</strong>
          <p>{error}</p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            Try Again
          </button>
        </div>
      )}

      {explanation && !loading && !error && (
        <div className="ai-explanation-body">
          {explanation.fallback && (
            <div className="ai-explanation-unavailable">
              <strong>Generated fallback</strong>
              <p>The explanation service returned a simplified response for this confirmed record.</p>
            </div>
          )}

          <ExplanationSection title="What was done">{explanation.whatWasDone}</ExplanationSection>
          <ExplanationSection title="Why it matters">{explanation.whyItMatters}</ExplanationSection>

          <section className="ai-explanation-section">
            <h3>What to watch for</h3>
            <ol className="ai-watch-list">
              {(explanation.watchFor ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>

          <p className="ai-disclaimer">{explanation.disclaimer}</p>
        </div>
      )}
    </section>
  );
}

function ExplanationSection({ title, children }) {
  return (
    <section className="ai-explanation-section">
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}
