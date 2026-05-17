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

export default function VehicleServiceHistoryPage() {
  const { vehicleId } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [history, setHistory] = useState(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('list');
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
      getVehicleServiceHistory(vehicleId, { sort: 'latest', keyword: query.trim() }),
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
  }, [vehicleId, query]);

  const records = useMemo(() => history?.records ?? [], [history]);

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
            <span>⌁</span>
            {vehicleName(vehicle)}
            <span>⌄</span>
          </button>
          <Link className="button-link" to={`/service-input/${vehicleId}`}>
            + Add Record
          </Link>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="service-history-toolbar">
        <label className="history-search-field">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by service type, shop, or parts..."
          />
        </label>
        <button className="button-link-secondary" type="button">
          ☷ Filters
        </button>
        <div className="history-view-toggle">
          <button className={viewMode === 'list' ? 'active' : ''} type="button" onClick={() => setViewMode('list')}>
            ☷
          </button>
          <button className={viewMode === 'grid' ? 'active' : ''} type="button" onClick={() => setViewMode('grid')}>
            ⊞
          </button>
        </div>
      </section>

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
      ) : (
        <section className="history-table-card refined-history-table">
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Service Type</th>
                <th>Category</th>
                <th>Parts</th>
                <th>Shop</th>
                <th>Odometer</th>
                <th>Cost</th>
                <th>Source</th>
                <th>Status</th>
                <th>Action</th>
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
                  <td>{record.partsReplaced || '-'}</td>
                  <td>{record.shopName || 'Not provided'}</td>
                  <td>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : '-'}</td>
                  <td>
                    <strong>{formatMoney(record.totalCost)}</strong>
                  </td>
                  <td>
                    <span className={badgeClass(record.sourceInputMethod)}>{record.sourceInputMethod}</span>
                  </td>
                  <td>
                    <span className={badgeClass('Validated')}>Validated</span>
                  </td>
                  <td>
                    <Link className="inline-link" to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
                      ⊙ View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
