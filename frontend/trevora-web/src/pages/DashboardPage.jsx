import React from 'react';
import { Link } from 'react-router-dom';

const summaryCards = [
  { icon: '▤', value: '24', label: 'Total Records', tone: 'blue' },
  { icon: '▣', value: 'May 7, 2026', label: 'Last Service', tone: 'green' },
  { icon: '$', value: 'PHP 78,400', label: 'Total Cost Recorded', tone: 'amber' },
  { icon: '!', value: '2', label: 'Needs Review', tone: 'red' },
];

const notifications = [
  { color: 'orange', title: 'Draft needs review: Air filter replacement', time: '2 hours ago' },
  { color: 'blue', title: 'Mechanic access request from Juan Santos', time: 'Yesterday' },
  { color: 'green', title: 'Service record saved: Oil Change + Brake Service', time: '2 days ago' },
];

const recentRecords = [
  {
    date: 'May 7, 2026',
    vehicle: 'Toyota Vios 2021',
    serviceType: 'Oil Change + Brake Service',
    shop: 'Superior Auto Repairs',
    cost: 'PHP 7,850',
    source: 'Receipt',
    status: 'Validated',
  },
  {
    date: 'Apr 12, 2026',
    vehicle: 'Toyota Vios 2021',
    serviceType: 'General Inspection',
    shop: 'Quick Fix Motors',
    cost: 'PHP 1,200',
    source: 'Manual',
    status: 'Validated',
  },
  {
    date: 'Mar 28, 2026',
    vehicle: 'Toyota Vios 2021',
    serviceType: 'Air Filter Replacement',
    shop: 'AutoZone PH',
    cost: 'PHP 980',
    source: 'Voice',
    status: 'Needs Review',
  },
  {
    date: 'Feb 18, 2026',
    vehicle: 'Toyota Vios 2021',
    serviceType: 'Tire Rotation',
    shop: 'GoFlex Tires',
    cost: 'PHP 500',
    source: 'Receipt',
    status: 'Draft',
  },
];

function badgeClass(value) {
  return `dashboard-badge dashboard-badge-${value.toLowerCase().replace(/\s+/g, '-')}`;
}

export default function DashboardPage() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  const serviceInputPath = activeVehicleId ? `/service-input/${activeVehicleId}` : '/vehicles';
  const historyPath = activeVehicleId ? `/vehicles/${activeVehicleId}/history` : '/vehicles';
  const sharePath = activeVehicleId ? `/vehicles/${activeVehicleId}/share` : '/vehicles';

  return (
    <main className="page-shell dashboard-page">
      <section className="dashboard-header">
        <div>
          <h1>Good morning, Juan</h1>
          <p>Here&apos;s an overview of your vehicle service records.</p>
        </div>
        <Link className="button-link" to={serviceInputPath}>
          ⊕ Add Service Record
        </Link>
      </section>

      <section className="dashboard-summary-grid">
        {summaryCards.map((card) => (
          <article className="dashboard-summary-card" key={card.label}>
            <span className={`dashboard-summary-icon ${card.tone}`}>{card.icon}</span>
            <strong>{card.value}</strong>
            <small>{card.label}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-mid-grid">
        <article className="dashboard-panel">
          <h2>Quick Actions</h2>
          <div className="dashboard-action-list">
            <Link className="dashboard-action primary" to={serviceInputPath}>
              <span>⊕</span>
              Add Service Record
            </Link>
            <Link className="dashboard-action" to={activeVehicleId ? `/service-input/${activeVehicleId}/receipt` : '/vehicles'}>
              <span>↥</span>
              Upload Receipt
            </Link>
            <Link className="dashboard-action" to={activeVehicleId ? `/service-input/${activeVehicleId}/voice` : '/vehicles'}>
              <span>♬</span>
              Record Voice Note
            </Link>
            <Link className="dashboard-action" to={activeVehicleId ? `/service-input/${activeVehicleId}/manual` : '/vehicles'}>
              <span>✎</span>
              Enter Manually
            </Link>
            <Link className="dashboard-action" to={sharePath}>
              <span>⌘</span>
              Share with Mechanic
            </Link>
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>Notifications</h2>
            <Link to="/access/requests">View all</Link>
          </div>
          <div className="dashboard-notification-list">
            {notifications.map((notification) => (
              <div className="dashboard-notification" key={notification.title}>
                <span className={`notification-dot ${notification.color}`} />
                <div>
                  <strong>{notification.title}</strong>
                  <small>{notification.time}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>Active Vehicle</h2>
            <Link to="/vehicles">All vehicles</Link>
          </div>
          <div className="dashboard-vehicle-card">
            <div className="dashboard-vehicle-heading">
              <span className="nav-icon">⌁</span>
              <div>
                <strong>Toyota Vios 2021</strong>
                <small>Plate: ABC 1234</small>
              </div>
            </div>
            <div className="dashboard-vehicle-facts no-odometer">
              <div>
                <span>Records</span>
                <strong>24 validated</strong>
              </div>
              <div>
                <span>Last Service</span>
                <strong>May 7, 2026</strong>
              </div>
              <div>
                <span>Total Cost</span>
                <strong>PHP 78,400</strong>
              </div>
            </div>
          </div>
          <Link className="button-link-secondary full-width" to={historyPath}>
            View Service History
          </Link>
        </article>
      </section>

      <section className="dashboard-panel recent-records-panel">
        <div className="dashboard-panel-heading">
          <h2>Recent Service Records</h2>
          <Link to={historyPath}>View all ›</Link>
        </div>
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
                <tr key={`${record.date}-${record.serviceType}`}>
                  <td>{record.date}</td>
                  <td>{record.vehicle}</td>
                  <td>
                    <strong>{record.serviceType}</strong>
                  </td>
                  <td>{record.shop}</td>
                  <td>
                    <strong>{record.cost}</strong>
                  </td>
                  <td>
                    <span className={badgeClass(record.source)}>{record.source}</span>
                  </td>
                  <td>
                    <span className={badgeClass(record.status)}>{record.status}</span>
                  </td>
                  <td>
                    <Link className="inline-link" to={historyPath}>
                      ⊙ View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
