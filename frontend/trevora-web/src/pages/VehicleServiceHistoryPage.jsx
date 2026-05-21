import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Calendar,
  Car,
  ChevronDown,
  Clock,
  Eye,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { getVehicleServiceHistory } from '../api/serviceHistory';
import { getVehicle } from '../api/vehicles';

function vehicleName(vehicle) {
  if (!vehicle) return 'Selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function vehicleSubtitle(vehicle) {
  if (!vehicle) return '';
  return vehicle.plateNumber || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function sourceLabel(value) {
  if (!value) return 'Manual';
  return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeText(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatParts(value) {
  if (!value) return '-';
  if (Array.isArray(value)) return value.join(', ');
  const text = String(value).trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).join(', ');
    } catch {
      return text;
    }
  }
  return text;
}

export default function VehicleServiceHistoryPage() {
  const { vehicleId } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [history, setHistory] = useState(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [showFilters, setShowFilters] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('latest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    window.localStorage.setItem('trevora.activeVehicleId', vehicleId);
  }, [vehicleId]);

  useEffect(() => {
    if (!vehicle) return;
    window.localStorage.setItem('trevora.activeVehicleLabel', vehicleName(vehicle));
    window.localStorage.setItem('trevora.activeVehicleSubtitle', vehicleSubtitle(vehicle) || 'Active vehicle');
  }, [vehicle]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      getVehicle(vehicleId),
      getVehicleServiceHistory(vehicleId, { sort: sortOrder, keyword: query.trim() }),
    ])
      .then(([vehicleData, historyData]) => {
        if (!active) return;
        setVehicle(vehicleData);
        setHistory(historyData);
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
  }, [vehicleId, query, sortOrder]);

  const records = useMemo(() => history?.records ?? [], [history]);
  const filteredRecords = useMemo(() => records.filter((record) => {
    const parts = formatParts(record.partsReplaced);
    const haystack = [
      record.serviceType,
      record.category,
      record.shopName,
      parts,
      record.remarks,
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesSource = sourceFilter === 'all'
      || String(record.sourceInputMethod || '').toLowerCase() === sourceFilter;
    const matchesServiceType = serviceTypeFilter === 'all'
      || record.serviceType === serviceTypeFilter;

    return matchesQuery && matchesSource && matchesServiceType;
  }), [records, query, sourceFilter, serviceTypeFilter]);
  const serviceTypes = history?.serviceTypes?.length
    ? history.serviceTypes
    : [...new Set(records.map((record) => record.serviceType).filter(Boolean))];
  const sources = [...new Set(records.map((record) => String(record.sourceInputMethod || '').toLowerCase()).filter(Boolean))];

  function clearFilters() {
    setQuery('');
    setSourceFilter('all');
    setServiceTypeFilter('all');
    setSortOrder('latest');
  }

  return (
    <main className="page-shell service-history-page">
      <section className="service-history-header">
        <div>
          <h1>Service History</h1>
          <p>
            {vehicleName(vehicle)} · {history?.totalRecords ?? records.length} record
            {(history?.totalRecords ?? records.length) === 1 ? '' : 's'}
          </p>
        </div>
        <div className="service-history-actions">
          <button className="vehicle-select-chip" type="button">
            <Car size={16} aria-hidden="true" />
            {vehicleName(vehicle)}
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <Link className="button-link" to={`/service-input/${vehicleId}`}>
            + Add Record
          </Link>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="service-history-toolbar">
        <label className="history-search-field">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by service type, shop, or parts..."
          />
        </label>
        <button className={`button-link-secondary history-filter-button ${showFilters ? 'active' : ''}`} type="button" onClick={() => setShowFilters((value) => !value)}>
          <SlidersHorizontal size={17} aria-hidden="true" />
          Filters
        </button>
        <div className="history-view-toggle">
          <button className={viewMode === 'list' ? 'active' : ''} type="button" onClick={() => setViewMode('list')}>
            <List size={17} aria-hidden="true" />
          </button>
          <button className={viewMode === 'timeline' ? 'active' : ''} type="button" onClick={() => setViewMode('timeline')}>
            <LayoutGrid size={17} aria-hidden="true" />
          </button>
        </div>
        {showFilters && (
          <div className="history-filter-panel">
            <label>
              Service type
              <select value={serviceTypeFilter} onChange={(event) => setServiceTypeFilter(event.target.value)}>
                <option value="all">All service types</option>
                {serviceTypes.map((serviceType) => (
                  <option key={serviceType} value={serviceType}>{serviceType}</option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">All sources</option>
                {sources.map((source) => (
                  <option key={source} value={source}>{sourceLabel(source)}</option>
                ))}
              </select>
            </label>
            <label>
              Sort
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option value="latest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <button className="history-clear-filters" type="button" onClick={clearFilters}>
              <X size={15} aria-hidden="true" />
              Clear filters
            </button>
          </div>
        )}
      </section>

      {loading ? (
        <p className="muted">Loading service history...</p>
      ) : records.length === 0 ? (
        <section className="history-empty-state">
          <h2>No confirmed service records yet</h2>
          <p>Confirmed service records for this vehicle will appear here.</p>
          <Link className="button-link" to={`/service-input/${vehicleId}`}>
            Add Service Record
          </Link>
        </section>
      ) : filteredRecords.length === 0 ? (
        <section className="history-empty-state refined-history-empty">
          <Calendar size={38} aria-hidden="true" />
          <h2>No records match your filters</h2>
          <p>Try a different search term or clear the current filters.</p>
          <button className="button-secondary" type="button" onClick={clearFilters}>
            Clear Filters
          </button>
        </section>
      ) : viewMode === 'timeline' ? (
        <section className="service-timeline refined-service-timeline">
          {filteredRecords.map((record) => (
            <article className="service-timeline-item" key={record.recordId}>
              <span className="timeline-marker" aria-hidden="true" />
              <div className="timeline-card refined-timeline-card">
                <div className="timeline-card-header">
                  <div>
                    <span className="history-date">{formatDate(record.serviceDate)}</span>
                    <h2>{record.serviceType}</h2>
                    <p>{normalizeText(record.shopName, 'Shop not provided')}</p>
                  </div>
                  <div className="history-badge-row">
                    <span className={badgeClass(record.sourceInputMethod)}>{sourceLabel(record.sourceInputMethod)}</span>
                    <span className={badgeClass('Validated')}>Validated</span>
                  </div>
                </div>
                <p className="history-record-description">{formatParts(record.partsReplaced)}</p>
                <div className="history-facts">
                  <span>{record.category || 'General'}</span>
                  <span>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</span>
                  <span>{formatMoney(record.totalCost)}</span>
                </div>
                <Link className="history-view-link" to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
                  View details
                  <Eye size={15} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="history-record-list" aria-label="Service records">
          <div className="history-result-summary">
            <strong>{filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'}</strong>
            <span>{sortOrder === 'oldest' ? 'Oldest first' : 'Newest first'}</span>
          </div>
          {filteredRecords.map((record) => (
            <article className="history-record-card" key={record.recordId}>
              <div className="history-record-date">
                <Calendar size={17} aria-hidden="true" />
                <span>{formatDate(record.serviceDate)}</span>
              </div>
              <div className="history-record-main">
                <div className="history-record-title-row">
                  <div>
                    <h2>{record.serviceType}</h2>
                    <p>{record.category || 'General'} · {normalizeText(record.shopName, 'Shop not provided')}</p>
                  </div>
                  <strong>{formatMoney(record.totalCost)}</strong>
                </div>
                <p className="history-record-description">{formatParts(record.partsReplaced)}</p>
                <div className="history-record-meta">
                  <span>
                    <Clock size={14} aria-hidden="true" />
                    {record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}
                  </span>
                  <span className={badgeClass(record.sourceInputMethod)}>{sourceLabel(record.sourceInputMethod)}</span>
                  <span className={badgeClass('Validated')}>Validated</span>
                </div>
              </div>
              <Link className="history-view-link" to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
                View
                <Eye size={15} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
