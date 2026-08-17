import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Car, LayoutGrid, Table2 } from 'lucide-react';
import { getMechanicSessionHistory } from '../api/mechanicAccess';
import MechanicAISearchPanel from '../components/MechanicAISearchPanel';
import PartsMap from '../components/PartsMap';
import { serviceItemsPartsInline, serviceItemsSearchText, serviceItemsSummaryLabel } from '../utils/serviceText';

const COMPONENT_RULES = [
  ['brakes', /\bbrake|rotor|pad|caliper|brake fluid/i],
  ['tires', /\btire|tyre|wheel|alignment|rotation|balanc/i],
  ['suspension', /\bsuspension|shock|strut|alignment|camber|toe/i],
  ['battery', /\bbattery|crank|terminal|electrical|alternator/i],
  ['airFilter', /\bair filter|cabin filter|intake/i],
  ['cooling', /\bcoolant|radiator|cooling|thermostat|overheat/i],
  ['transmission', /\btransmission|gearbox|clutch|atf|cvt/i],
  ['ac', /\baircon|a\/c| ac |compressor|freon|cabin/i],
  ['lights', /\blight|headlamp|tail|signal|bulb/i],
  ['body', /\bbody|door|paint|panel|bumper|windshield/i],
  ['exhaust', /\bexhaust|muffler|emission/i],
  ['fluids', /\bfluid|oil|lubricant|washer/i],
  ['engine', /\boil|engine|pms|tune|inspection|filter/i],
];

const COMPONENT_KEY_BY_LABEL = {
  Engine: 'engine',
  'Engine Oil': 'engine',
  'Oil Filter': 'engine',
  Brakes: 'brakes',
  Tires: 'tires',
  Battery: 'battery',
  'Air Filter': 'airFilter',
  Transmission: 'transmission',
  'Cooling System': 'cooling',
  Suspension: 'suspension',
  Lights: 'lights',
  'AC System': 'ac',
  Electrical: 'battery',
  Body: 'body',
  Fluids: 'fluids',
  Other: 'engine',
};

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function badgeClass(value) {
  return `dashboard-badge dashboard-badge-${String(value || 'draft').toLowerCase().replace(/\s+/g, '-')}`;
}

function minutesRemaining(expiresAt) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000));
}

function sourceLabel(value) {
  if (!value) return 'Manual';
  return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classificationFor(record) {
  const metadataClassification = record?.fieldMetadata?.classification;
  if (metadataClassification && typeof metadataClassification === 'object') return metadataClassification;
  if (record?.classification && typeof record.classification === 'object') return record.classification;
  return {};
}

function recordSearchText(record) {
  return [
    serviceItemsSearchText(record.services),
    record.category,
    record.shopName,
    record.location,
    record.remarks,
  ].filter(Boolean).join(' ');
}

function inferComponents(record) {
  const classification = classificationFor(record);
  const controlledComponents = Array.isArray(record.relatedComponents)
    ? record.relatedComponents
    : Array.isArray(classification.relatedComponents)
      ? classification.relatedComponents
      : [];
  const mapped = controlledComponents.map((component) => COMPONENT_KEY_BY_LABEL[component]).filter(Boolean);
  if (mapped.length) return [...new Set(mapped)];
  const haystack = recordSearchText(record);
  const matches = COMPONENT_RULES.filter(([, pattern]) => pattern.test(haystack)).map(([key]) => key);
  if (matches.length) return [...new Set(matches)];
  if (String(record.category || classification.serviceCategory || '').toLowerCase().includes('inspection')) {
    return ['engine', 'brakes', 'tires', 'lights'];
  }
  return ['engine'];
}

function normalizeMechanicRecord(record) {
  const classification = classificationFor(record);
  return {
    ...record,
    recordId: record.recordId ?? record.id,
    category: record.category || classification.serviceCategory || 'Service',
    relatedComponents: Array.isArray(record.relatedComponents) ? record.relatedComponents : classification.relatedComponents,
    recordTags: Array.isArray(record.recordTags) ? record.recordTags : classification.recordTags,
    status: record.status || 'Validated',
    components: inferComponents(record),
  };
}

function newestRecord(records) {
  if (!records.length) return null;
  return [...records].sort((a, b) => String(b.serviceDate || '').localeCompare(String(a.serviceDate || '')))[0];
}

function latestOdometer(records) {
  const withOdometer = records.filter((record) => record.odometer != null);
  if (!withOdometer.length) return null;
  return newestRecord(withOdometer)?.odometer ?? null;
}

function hasReceipt(record) {
  return Boolean(record.receiptStoragePath || record.fieldMetadata?.storedReceiptPages?.some((page) => page?.path));
}

function groupByMonth(records) {
  return records.reduce((groups, record) => {
    const label = record.serviceDate
      ? new Date(`${record.serviceDate}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : 'No date';
    const group = groups.find((item) => item.label === label);
    if (group) group.records.push(record);
    else groups.push({ label, records: [record] });
    return groups;
  }, []);
}

function inferViewFromMechanicQuery(query) {
  const text = String(query || '').toLowerCase();
  if (/\b(table|list|records?|all records?|service history)\b/.test(text)) return 'table';
  if (/\b(timeline|chronology|recent|latest|last|when|date|before|after|sequence|order|history)\b/.test(text)) return 'timeline';
  if (/\b(parts?|component|map|engine|oil|filter|brake|tire|wheel|battery|coolant|radiator|suspension|light|aircon|a\/c|body|paint)\b/.test(text)) return 'parts-map';
  return 'timeline';
}

export default function MechanicAccessSessionPlaceholderPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [viewMode, setViewMode] = useState('parts-map');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const records = useMemo(() => (history?.records ?? []).map(normalizeMechanicRecord), [history]);
  const matchedRecords = useMemo(() => (searchResult?.records ?? []).map(normalizeMechanicRecord), [searchResult]);
  const matchedIds = useMemo(
    () => new Set(matchedRecords.map((record) => record.recordId)),
    [matchedRecords]
  );
  const visibleRecords = searchResult ? matchedRecords : records;
  const lastRecord = newestRecord(records);
  const sharedReceipts = records.filter(hasReceipt).length;
  const currentOdometer = latestOdometer(records);
  const groupedRecords = useMemo(() => groupByMonth(visibleRecords), [visibleRecords]);
  const remaining = minutesRemaining(history?.expiresAt);
  const openRecord = (id) => navigate(`/mechanic/access/${sessionId}/history/${id}`);
  const handleSearch = (result, query) => {
    setSearchResult(result);
    if (result) setViewMode(result.recommendedView || inferViewFromMechanicQuery(query));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getMechanicSessionHistory(sessionId)
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  return (
    <main className="page-shell mechanic-shared-page">
      {error && !loading ? (
        <section className="history-empty-state mechanic-blocked-state">
          <h2>Access unavailable</h2>
          <p>{error}</p>
          <Link className="button-link-secondary" to="/login">
            Back to owner sign in
          </Link>
        </section>
      ) : (
        <>
          {loading && <p className="muted">Loading approved service history...</p>}

          {history && (
            <>
              <div className="readonly-access-banner">
                <span className="notice-icon">R</span>
                <div>
                  <strong>Mechanic read-only workspace for {history.vehicleLabel}</strong>
                  <p>
                    Scope: owner-approved service history only - {records.length} record{records.length === 1 ? '' : 's'} -
                    {remaining == null ? ' active session' : ` ${remaining} min remaining`}
                  </p>
                </div>
                <span className="access-status access-status-active">Access active</span>
              </div>

              <section className="mechanic-context-grid" aria-label="Shared service context">
                <article className="mechanic-context-card">
                  <span>Shared records</span>
                  <strong>{records.length}</strong>
                  <small>Confirmed by owner</small>
                </article>
                <article className="mechanic-context-card">
                  <span>Last service</span>
                  <strong>{lastRecord ? formatDate(lastRecord.serviceDate) : 'No date'}</strong>
                  <small>{lastRecord ? serviceItemsSummaryLabel(lastRecord.services) : 'No service yet'}</small>
                </article>
                <article className="mechanic-context-card">
                  <span>Latest odometer</span>
                  <strong>{currentOdometer != null ? Number(currentOdometer).toLocaleString() : '-'}</strong>
                  <small>km from shared records</small>
                </article>
                <article className="mechanic-context-card">
                  <span>Source evidence</span>
                  <strong>{sharedReceipts}</strong>
                  <small>receipt{sharedReceipts === 1 ? '' : 's'} attached</small>
                </article>
              </section>

              <MechanicAISearchPanel sessionId={sessionId} onSearch={handleSearch} />

              <section className="mechanic-view-toolbar">
                <div className="history-result-summary mechanic-result-summary">
                  <strong>{visibleRecords.length} of {records.length} approved records</strong>
                  <span>{searchResult ? 'AI-filtered shared history' : 'Newest first'}</span>
                </div>
                <div className="history-view-toggle history-view-toggle-wide mechanic-view-toggle" aria-label="Mechanic service history view">
                  <button className={viewMode === 'parts-map' ? 'active' : ''} type="button" onClick={() => setViewMode('parts-map')}>
                    <Car size={17} aria-hidden="true" />
                    Parts Map
                  </button>
                  <button className={viewMode === 'timeline' ? 'active' : ''} type="button" onClick={() => setViewMode('timeline')}>
                    <LayoutGrid size={17} aria-hidden="true" />
                    Timeline
                  </button>
                  <button className={viewMode === 'table' ? 'active' : ''} type="button" onClick={() => setViewMode('table')}>
                    <Table2 size={17} aria-hidden="true" />
                    Table
                  </button>
                </div>
              </section>

              {records.length === 0 ? (
                <div className="history-empty-state">
                  <h2>No confirmed service records in scope</h2>
                  <p>The owner approved access, but this vehicle has no confirmed service records yet.</p>
                </div>
              ) : visibleRecords.length === 0 ? (
                <div className="history-empty-state">
                  <h2>No matching shared records</h2>
                  <p>Try a different service type, shop, part, or work keyword.</p>
                </div>
              ) : viewMode === 'parts-map' ? (
                <section className="mechanic-map-section">
                  <PartsMap
                    records={visibleRecords}
                    odometer={currentOdometer || 0}
                    onSelectRecord={(record) => openRecord(record.recordId)}
                    onOpenRecord={openRecord}
                  />
                </section>
              ) : viewMode === 'timeline' ? (
                <section className="history-two-column mechanic-history-two-column">
                  <div className="service-timeline refined-service-timeline rich-service-timeline">
                    {groupedRecords.map((group) => (
                      <div className="history-month-group" key={group.label}>
                        <div className="history-month-label">
                          <span>{group.label}</span>
                          <i />
                          <small>{group.records.length} record{group.records.length === 1 ? '' : 's'}</small>
                        </div>
                        {group.records.map((record) => (
                          <article className="service-timeline-item" key={record.recordId}>
                            <span className="timeline-marker" aria-hidden="true" />
                            <div className="timeline-card refined-timeline-card rich-timeline-card mechanic-timeline-card">
                              <div className="timeline-card-header">
                                <div>
                                  <span className="history-date">{formatDate(record.serviceDate)}</span>
                                  <h2>{serviceItemsSummaryLabel(record.services)}</h2>
                                  <p>{record.shopName || 'Shop not provided'}</p>
                                </div>
                                <div className="history-badge-row">
                                  <span className={badgeClass(record.sourceInputMethod)}>{sourceLabel(record.sourceInputMethod)}</span>
                                  <span className={badgeClass(record.status)}>{record.status}</span>
                                </div>
                              </div>
                              <p className="history-record-description">{serviceItemsPartsInline(record.services, 'No parts listed')}</p>
                              <div className="history-facts">
                                <span>{record.category || 'Service'}</span>
                                <span>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</span>
                                <span>{formatMoney(record.totalCost)}</span>
                                <span>{hasReceipt(record) ? 'Receipt attached' : 'No receipt image'}</span>
                              </div>
                              {Array.isArray(record.relatedComponents) && record.relatedComponents.length > 0 && (
                                <div className="classification-badge-row compact">
                                  {record.relatedComponents.slice(0, 4).map((component) => (
                                    <span className="field-confidence-badge field-confidence-high" key={component}>{component}</span>
                                  ))}
                                </div>
                              )}
                              <div className="rich-record-actions">
                                <Link className="history-view-link" to={`/mechanic/access/${sessionId}/history/${record.recordId}`}>
                                  Open record
                                </Link>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ))}
                  </div>
                  <MechanicEvidenceRail records={visibleRecords} totalRecords={records.length} />
                </section>
              ) : (
                <section className="history-two-column mechanic-history-two-column">
                  <div className="history-table-shell refined-history-table" aria-label="Shared service records table">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Service</th>
                          <th>Category</th>
                          <th>Shop / Service Center</th>
                          <th>Odometer</th>
                          <th>Cost</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRecords.map((record) => (
                          <tr key={record.recordId} onClick={() => openRecord(record.recordId)}>
                            <td>{formatDate(record.serviceDate)}</td>
                            <td><strong>{serviceItemsSummaryLabel(record.services)}</strong></td>
                            <td>
                              <span className={badgeClass(record.category)}>{record.category || 'Service'}</span>
                              {Array.isArray(record.relatedComponents) && record.relatedComponents[0] && (
                                <small className="table-component-hint">{record.relatedComponents.slice(0, 2).join(', ')}</small>
                              )}
                            </td>
                            <td>{record.shopName || 'Shop not provided'}</td>
                            <td>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</td>
                            <td>{formatMoney(record.totalCost)}</td>
                            <td><span className={badgeClass(record.sourceInputMethod)}>{sourceLabel(record.sourceInputMethod)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <MechanicEvidenceRail records={visibleRecords} totalRecords={records.length} />
                </section>
              )}

              {viewMode !== 'table' && visibleRecords.length > 0 && (
                <section className="mechanic-record-section mechanic-quick-open-section">
                  <div className="mechanic-record-header">
                    <h2>Quick Open</h2>
                    <span>{visibleRecords.length} shared record{visibleRecords.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mechanic-record-list mechanic-quick-open-list">
                    {visibleRecords.slice(0, 4).map((record) => (
                      <article
                        className={`mechanic-record-card mechanic-record-card-compact ${matchedIds.has(record.recordId) ? 'mechanic-record-card-match' : ''}`}
                        key={record.recordId}
                      >
                        <div>
                          <div className="mechanic-record-title">
                            <strong>{serviceItemsSummaryLabel(record.services)}</strong>
                            <span className={badgeClass(record.category)}>{record.category || 'Service'}</span>
                            {matchedIds.has(record.recordId) && <span className={badgeClass('ai-match')}>AI match</span>}
                          </div>
                          <p>
                            {formatDate(record.serviceDate)} - {record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'} - {formatMoney(record.totalCost)}
                          </p>
                        </div>
                        <Link className="button-link-secondary mechanic-record-open" to={`/mechanic/access/${sessionId}/history/${record.recordId}`}>
                          Open
                        </Link>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <Link className="owner-return-link owner-return-link-inline" to="/login">
                Back to owner sign in
              </Link>
            </>
          )}
        </>
      )}
    </main>
  );
}

function MechanicEvidenceRail({ records, totalRecords }) {
  const receiptCount = records.filter(hasReceipt).length;
  const sourceTypes = [...new Set(records.map((record) => sourceLabel(record.sourceInputMethod)))];
  const components = records.flatMap((record) => record.relatedComponents || []);
  const topComponents = [...new Set(components)].slice(0, 5);

  return (
    <aside className="figma-insights-rail mechanic-evidence-rail">
      <section className="figma-rail-card mechanic-evidence-card">
        <h2>Shared Scope</h2>
        <dl className="compact-facts">
          <div>
            <dt>Visible records</dt>
            <dd>{records.length} of {totalRecords}</dd>
          </div>
          <div>
            <dt>Receipt evidence</dt>
            <dd>{receiptCount}</dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>{sourceTypes.join(', ') || 'Manual'}</dd>
          </div>
        </dl>
      </section>

      {topComponents.length > 0 && (
        <section className="figma-rail-card mechanic-evidence-card">
          <h2>Components Found</h2>
          <div className="mechanic-component-chips mechanic-evidence-components">
            {topComponents.map((component) => (
              <span key={component}>{component}</span>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
