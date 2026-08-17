import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchMechanicSessionHistory } from '../api/mechanicAccess';
import { serviceItemsSummaryLabel } from '../utils/serviceText';

const suggestions = [
  'What is the most recent service?',
  'Any brake work done?',
  'Oil change history',
  'Battery replacement history',
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
        <span>*</span>
        <div>
          <strong>Ask about this vehicle&apos;s history</strong>
          <p>Keyword-based MVP search checks only the approved shared records.</p>
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
