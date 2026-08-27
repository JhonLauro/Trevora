import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchMechanicSessionHistory } from '../api/mechanicAccess';
import { serviceItemsSummaryLabel } from '../utils/serviceText';

/* Three, not four, and each one a whole question.
   The point of these is to teach that plain language works, so shortening
   them to labels ("Last oil change") would sell the feature short. Three full
   questions fit on one line where four wrapped to three -- measured at 53px of
   row against 95px -- which matters now that the card opens the page. */
const suggestions = [
  'What was done most recently?',
  'When was the last oil change?',
  'Any brake or clutch work?',
];

export default function MechanicAISearchPanel({ sessionId, onSearch }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runSearch(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (!trimmed) return;

    setQuery(trimmed);
    setLoading(true);
    setError('');
    try {
      const response = await searchMechanicSessionHistory(sessionId, trimmed);
      setResult(response);
      onSearch?.(response, trimmed);
    } catch (err) {
      setResult(null);
      onSearch?.(null, trimmed);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    runSearch();
  }

  function clearSearch() {
    setQuery('');
    setResult(null);
    setError('');
    onSearch?.(null, '');
  }

  function formatDate(value) {
    if (!value) return 'No date';
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <section className="mechanic-ask-card">
      <div className="mechanic-ask-heading">
        {/* Was a literal asterisk standing in for an icon. Harmless when the
            card sat at the foot of the page; as the first thing a mechanic
            sees it just read as unfinished. currentColor so it inherits the
            heading colour rather than introducing one. */}
        <span aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="8.75" cy="8.75" r="5.25" />
            <line x1="12.6" y1="12.6" x2="17" y2="17" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <strong>Ask about this vehicle&apos;s history</strong>
          <p>Ask in plain words. Searches only the records this owner approved for you.</p>
        </div>
      </div>

      <form className="mechanic-ask-input" onSubmit={handleSubmit}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. When was the last oil change?"
        />
        {result ? (
          <button className="button-secondary" type="button" onClick={clearSearch}>
            Clear
          </button>
        ) : (
          <button type="submit" disabled={loading || !query.trim()}>
            {loading ? 'Searching...' : 'Ask'}
          </button>
        )}
      </form>

      <div className="mechanic-suggestion-row">
        <span>Try:</span>
        {suggestions.map((suggestion) => (
          <button type="button" key={suggestion} onClick={() => runSearch(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      {error && <div className="alert mechanic-search-alert">{error}</div>}

      {result && (
        <div className="mechanic-ai-answer">
          <div className="mechanic-ai-answer-heading">
            <span>{result.answerSource === 'AI' ? 'AI Answer' : 'Search Answer'}</span>
            <small>
              {result.recommendedView ? `${result.recommendedView.replace('-', ' ')} · ` : ''}
              {result.resultCount} record{result.resultCount === 1 ? '' : 's'} matched
            </small>
          </div>
          <p>{result.answer}</p>
          {result.records.length > 0 && (
            <div className="mechanic-related-results">
              <span>Open matching records</span>
              {result.records.map((record) => (
                <Link key={record.recordId} to={`/mechanic/access/${sessionId}/history/${record.recordId}`}>
                  <strong>{serviceItemsSummaryLabel(record.services)}</strong>
                  <small>{formatDate(record.serviceDate)}</small>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
