import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  clearActiveVehicleSelection,
  displayVehicleName,
  displayVehicleSubtitle,
  getActiveVehicleId,
  setActiveVehicleSelection,
} from '../api/activeVehicle.js';
import { getActiveCurrentUser, getUserDisplayName } from '../api/currentUser.js';
import { getVehicleServiceHistory } from '../api/serviceHistory.js';
import { getVehicles } from '../api/vehicles.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const moneyFormatter = new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 0,
});

function badgeClass(value) {
  return `dashboard-badge dashboard-badge-${String(value).toLowerCase().replace(/\s+/g, '-')}`;
}

function formatDate(value) {
  if (!value) return 'Not available';
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function formatMoney(value) {
  return `PHP ${moneyFormatter.format(Number(value || 0))}`;
}

function formatSource(value) {
  return String(value || 'Manual')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DashboardPage() {
  const currentUser = getActiveCurrentUser();
  const [vehicles, setVehicles] = useState([]);
  const [activeVehicle, setActiveVehicle] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getVehicles()
      .then((data) => {
        if (!active) return;
        const currentId = getActiveVehicleId();
        const selectedVehicle = data.find((vehicle) => vehicle.vehicleId === currentId) ?? data[0] ?? null;

        setVehicles(data);
        setActiveVehicle(selectedVehicle);
        setError('');

        if (selectedVehicle) {
          setActiveVehicleSelection(selectedVehicle);
        } else {
          clearActiveVehicleSelection();
          setRecords([]);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingVehicles(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeVehicle?.vehicleId) return undefined;

    let active = true;
    setLoadingRecords(true);

    getVehicleServiceHistory(activeVehicle.vehicleId, { sort: 'newest' })
      .then((history) => {
        if (active) {
          setRecords(history.records ?? []);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingRecords(false);
      });

    return () => {
      active = false;
    };
  }, [activeVehicle?.vehicleId]);

  const activeVehicleId = activeVehicle?.vehicleId;
  const serviceInputPath = activeVehicleId ? `/service-input/${activeVehicleId}` : '/vehicles';
  const historyPath = activeVehicleId ? `/vehicles/${activeVehicleId}/history` : '/vehicles';
  const sharePath = activeVehicleId ? `/vehicles/${activeVehicleId}/share` : '/vehicles';
  const recentRecords = records.slice(0, 5);
  const totalCost = useMemo(
    () => records.reduce((sum, record) => sum + Number(record.totalCost || 0), 0),
    [records],
  );
  const firstName = getUserDisplayName(currentUser).split(' ')[0] || 'there';

  const summaryCards = [
    { icon: 'V', value: vehicles.length, label: 'Registered Vehicles', tone: 'blue' },
    { icon: 'R', value: records.length, label: 'Active Vehicle Records', tone: 'green' },
    { icon: 'D', value: records[0]?.serviceDate ? formatDate(records[0].serviceDate) : 'No records yet', label: 'Last Service', tone: 'amber' },
    { icon: '$', value: formatMoney(totalCost), label: 'Total Cost Recorded', tone: 'red' },
  ];

  return (
    <main className="page-shell dashboard-page">
      <section className="dashboard-header">
        <div>
          <h1>Good morning, {firstName}</h1>
          <p>
            {activeVehicle
              ? `Here is the service overview for ${displayVehicleName(activeVehicle)}.`
              : 'Register a vehicle to start building your service history.'}
          </p>
        </div>
        <Link className="button-link" to={serviceInputPath}>
          {activeVehicle ? 'Add Service Record' : 'Add Vehicle'}
        </Link>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="dashboard-summary-grid">
        {summaryCards.map((card) => (
          <article className="dashboard-summary-card" key={card.label}>
            <span className={`dashboard-summary-icon ${card.tone}`}>{card.icon}</span>
            <strong>{loadingVehicles ? 'Loading...' : card.value}</strong>
            <small>{card.label}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-mid-grid">
        <article className="dashboard-panel">
          <h2>Quick Actions</h2>
          <div className="dashboard-action-list">
            <Link className="dashboard-action primary" to={serviceInputPath}>
              <span>+</span>
              {activeVehicle ? 'Add Service Record' : 'Add Vehicle'}
            </Link>
            <Link className="dashboard-action" to={activeVehicleId ? `/service-input/${activeVehicleId}/receipt` : '/vehicles'}>
              <span>R</span>
              Upload Receipt
            </Link>
            <Link className="dashboard-action" to={activeVehicleId ? `/service-input/${activeVehicleId}/voice` : '/vehicles'}>
              <span>V</span>
              Record Voice Note
            </Link>
            <Link className="dashboard-action" to={activeVehicleId ? `/service-input/${activeVehicleId}/manual` : '/vehicles'}>
              <span>M</span>
              Enter Manually
            </Link>
            <Link className="dashboard-action" to={sharePath}>
              <span>S</span>
              Share with Mechanic
            </Link>
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>Notifications</h2>
            <Link to="/access/requests">View all</Link>
          </div>
          <div className="dashboard-empty-state compact">
            <strong>No new notifications</strong>
            <p>Access requests and service review reminders will appear here.</p>
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>Active Vehicle</h2>
            <Link to="/vehicles">All vehicles</Link>
          </div>
          {activeVehicle ? (
            <>
              <div className="dashboard-vehicle-card">
                <div className="dashboard-vehicle-heading">
                  <span className="nav-icon">V</span>
                  <div>
                    <strong>{displayVehicleName(activeVehicle)}</strong>
                    <small>{displayVehicleSubtitle(activeVehicle)}</small>
                  </div>
                </div>
                <div className="dashboard-vehicle-facts no-odometer">
                  <div>
                    <span>Records</span>
                    <strong>{records.length} saved</strong>
                  </div>
                  <div>
                    <span>Last Service</span>
                    <strong>{records[0]?.serviceDate ? formatDate(records[0].serviceDate) : 'No records yet'}</strong>
                  </div>
                  <div>
                    <span>Total Cost</span>
                    <strong>{formatMoney(totalCost)}</strong>
                  </div>
                </div>
              </div>
              <Link className="button-link-secondary full-width" to={historyPath}>
                View Service History
              </Link>
            </>
          ) : (
            <div className="dashboard-empty-state">
              <strong>No vehicle registered yet</strong>
              <p>Add your first vehicle before creating service records.</p>
              <Link className="button-link-secondary full-width" to="/vehicles">
                Add Vehicle
              </Link>
            </div>
          )}
        </article>
      </section>

      <section className="dashboard-panel recent-records-panel">
        <div className="dashboard-panel-heading">
          <h2>Recent Service Records</h2>
          <Link to={historyPath}>View all</Link>
        </div>
        {loadingRecords ? (
          <div className="dashboard-empty-state">
            <strong>Loading service records...</strong>
          </div>
        ) : recentRecords.length === 0 ? (
          <div className="dashboard-empty-state">
            <strong>No service records yet</strong>
            <p>Saved records for the active vehicle will appear here.</p>
          </div>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Service Type</th>
                  <th>Shop/Mechanic</th>
                  <th>Cost</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((record) => (
                  <tr key={record.recordId}>
                    <td>{formatDate(record.serviceDate)}</td>
                    <td>{displayVehicleName(activeVehicle)}</td>
                    <td>
                      <strong>{record.serviceType}</strong>
                    </td>
                    <td>{record.shopName || 'Not provided'}</td>
                    <td>
                      <strong>{formatMoney(record.totalCost)}</strong>
                    </td>
                    <td>
                      <span className={badgeClass(formatSource(record.sourceInputMethod))}>
                        {formatSource(record.sourceInputMethod)}
                      </span>
                    </td>
                    <td>
                      <span className={badgeClass('Validated')}>Validated</span>
                    </td>
                    <td>
                      <Link className="inline-link" to={`/vehicles/${record.vehicleId}/history/${record.recordId}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
