import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import RecordsTable from '../components/ink/RecordsTable.jsx';
import useGarage from '../hooks/useGarage.js';
import { pluralize } from '../utils/format';
import { recordSearchText } from '../utils/serviceComponents';
import { serviceItemsSummaryLabel } from '../utils/serviceText';

/**
 * Every record across every vehicle — where the dashboard's "View all {n}"
 * goes.
 *
 * Deliberately plain: this screen has not had its own design slice yet, so it
 * reuses the dashboard's table wholesale rather than inventing a layout that
 * would only be thrown away.
 */
export default function RecordsPage() {
  const { allRecords, loading, error } = useGarage();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allRecords;
    return allRecords.filter((record) => [
      record.vehicleName,
      serviceItemsSummaryLabel(record.services),
      recordSearchText(record),
    ].join(' ').toLowerCase().includes(needle));
  }, [allRecords, query]);

  return (
    <main className="ink-page">
      <header className="ink-page__header">
        <div>
          <h1 className="ink-page__title">Records</h1>
          <p className="ink-page__summary">
            {loading ? 'Loading your records…' : `${pluralize(allRecords.length, 'record')} across your vehicles`}
          </p>
        </div>
        <Link className="ink-button" to="/service-input">Add service record</Link>
      </header>

      {error && <div className="ink-alert">{error}</div>}

      <div className="records-toolbar">
        <input
          type="search"
          value={query}
          aria-label="Search records"
          placeholder="Search service, part, shop, or notes"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {!loading && filtered.length === 0 ? (
        <section className="ink-empty">
          <h2 className="ink-empty__title">
            {allRecords.length === 0 ? 'No records yet' : 'Nothing matches that search'}
          </h2>
          <p className="ink-empty__body">
            {allRecords.length === 0
              ? 'Upload a receipt, speak a note, or type a service in — whichever is quickest right now.'
              : 'Try a shop name, a part, or the kind of service you are looking for.'}
          </p>
          {allRecords.length === 0 && (
            <div className="ink-empty__actions">
              <Link className="ink-button" to="/service-input">Add service record</Link>
            </div>
          )}
        </section>
      ) : (
        <section className="ink-table-card">
          <RecordsTable records={filtered} ariaLabel="All service records across your vehicles" />
        </section>
      )}
    </main>
  );
}
