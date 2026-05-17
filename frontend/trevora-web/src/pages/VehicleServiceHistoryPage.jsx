import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getVehicleServiceHistory } from '../api/serviceHistory';
import { getVehicle } from '../api/vehicles';

function vehicleName(vehicle) {
  if (!vehicle) return 'Selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function vehicleSubtitle(vehicle) {
  if (!vehicle) return '';
  return `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}${
    vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''
  }`;
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

function recordSearchText(record) {
  return [
    record.serviceType,
    record.shopName,
    record.partsReplaced,
    record.laborPerformed,
  ]
    .filter(Boolean)
    .join(' - ');
}

export default function VehicleServiceHistoryPage() {
  const { vehicleId } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [history, setHistory] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [filters, setFilters] = useState({ sort: 'latest', serviceType: '', keyword: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    window.localStorage.setItem('trevora.activeVehicleId', vehicleId);
  }, [vehicleId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      getVehicle(vehicleId),
      getVehicleServiceHistory(vehicleId, appliedFilters),
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
  }, [vehicleId, appliedFilters]);

  const records = history?.records ?? [];
  const serviceTypes = useMemo(() => {
    const fromHistory = history?.serviceTypes ?? [];
    const fromRecords = records.map((record) => record.serviceType).filter(Boolean);
    return [...new Set([...fromHistory, ...fromRecords])].sort((a, b) => a.localeCompare(b));
  }, [history, records]);

  function updateFilter(event) {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    setAppliedFilters({
      sort: filters.sort || 'latest',
      serviceType: filters.serviceType.trim(),
      keyword: filters.keyword.trim(),
    });
  }

  function clearFilters() {
    const reset = { sort: 'latest', serviceType: '', keyword: '' };
    setFilters(reset);
    setAppliedFilters(reset);
  }

  return (
    <main className="page-shell module-three-page">
      <section className="page-header page-header-row">
        <div>
          <p className="eyebrow">
            <Link className="inline-link" to="/vehicles">
              My Vehicles
            </Link>
            <span>Service History</span>
          </p>
          <h1>{vehicleName(vehicle)}</h1>
          <p>{vehicleSubtitle(vehicle) || 'Confirmed service records for this vehicle.'}</p>
        </div>
        <Link className="button-link" to={`/service-input/${vehicleId}`}>
          Add Record
        </Link>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="history-main">
          <form className="history-filter-bar" onSubmit={applyFilters}>
            <label>
              Search
              <input
                name="keyword"
                value={filters.keyword}
                onChange={updateFilter}
                placeholder="Search service, shop, parts, labor, remarks"
              />
            </label>
            <label>
              Service type
              <select name="serviceType" value={filters.serviceType} onChange={updateFilter}>
                <option value="">All service types</option>
                {serviceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort
              <select name="sort" value={filters.sort} onChange={updateFilter}>
                <option value="latest">Latest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <div className="history-filter-actions">
              <button type="submit">Apply</button>
              <button className="button-secondary" type="button" onClick={clearFilters}>
                Clear
              </button>
            </div>
          </form>

          <div className="history-summary-row">
            <strong>{history?.totalRecords ?? 0} confirmed record(s)</strong>
            <div className="history-view-controls" aria-label="History view options">
              <span>{history?.sort === 'oldest' ? 'Oldest first' : 'Latest first'}</span>
              <button
                className={viewMode === 'list' ? 'view-toggle active' : 'view-toggle'}
                type="button"
                onClick={() => setViewMode('list')}
              >
                List
              </button>
              <button
                className={viewMode === 'grid' ? 'view-toggle active' : 'view-toggle'}
                type="button"
                onClick={() => setViewMode('grid')}
              >
                Grid
              </button>
            </div>
          </div>

          {loading ? (
            <p className="muted">Loading service history...</p>
          ) : records.length === 0 ? (
            <section className="history-empty-state">
              <h2>No confirmed service records yet</h2>
              <p>Confirmed Module 2 service records for this vehicle will appear here.</p>
              <Link className="button-link" to={`/service-input/${vehicleId}`}>
                Add Service Record
              </Link>
            </section>
          ) : viewMode === 'list' ? (
            <div className="history-table-card">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Service Type</th>
                    <th>Category</th>
                    <th>Shop</th>
                    <th>Odometer</th>
                    <th>Cost</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.recordId}>
                      <td>{formatDate(record.serviceDate)}</td>
                      <td>
                        <strong>{record.serviceType}</strong>
                      </td>
                      <td>{record.category}</td>
                      <td>{record.shopName || 'Not provided'}</td>
                      <td>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</td>
                      <td>
                        <strong>{formatMoney(record.totalCost)}</strong>
                      </td>
                      <td>
                        <span className="badge subtle">{record.sourceInputMethod}</span>
                      </td>
                      <td>
                        <span className="badge">Validated</span>
                      </td>
                      <td>
                        <Link className="secondary-link" to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
                          View details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="service-timeline">
              {records.map((record) => (
                <article className="service-timeline-item" key={record.recordId}>
                  <div className="timeline-marker" aria-hidden="true" />
                  <div className="timeline-card">
                    <div className="timeline-card-header">
                      <div>
                        <span className="history-date">{formatDate(record.serviceDate)}</span>
                        <h2>{record.serviceType}</h2>
                      </div>
                      <div className="history-badge-row">
                        <span className="badge subtle">{record.category}</span>
                        <span className="badge">Validated</span>
                      </div>
                    </div>
                    <p>{recordSearchText(record) || 'No additional details provided.'}</p>
                    <div className="history-facts">
                      <span>{formatMoney(record.totalCost)}</span>
                      <span>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</span>
                      <span>{record.sourceInputMethod}</span>
                    </div>
                    <div className="card-actions">
                      <Link className="secondary-link" to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
                        View details
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
      </section>
    </main>
  );
}
