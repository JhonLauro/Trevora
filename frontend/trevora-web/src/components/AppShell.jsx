import { NavLink, useLocation } from 'react-router-dom';

function getActiveVehiclePath() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  return activeVehicleId ? `/service-input/${activeVehicleId}` : '/vehicles';
}

export default function AppShell({ children }) {
  const location = useLocation();
  const addServicePath = getActiveVehiclePath();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-mark">
          <span className="brand-icon">T</span>
          <strong>Trevora</strong>
        </div>

        <div className="module-chip">
          <span>Active module</span>
          <strong>Module 1</strong>
          <small>Service Record Input</small>
        </div>

        <nav className="side-nav" aria-label="Primary">
          <NavLink to="/vehicles">My Vehicles</NavLink>
          <NavLink
            className={location.pathname.startsWith('/service-input') ? 'active' : undefined}
            to={addServicePath}
            title={addServicePath === '/vehicles' ? 'Select a vehicle first' : 'Add a service record'}
          >
            Add Service Record
          </NavLink>
          <span className="nav-placeholder" aria-disabled="true">
            Service History
          </span>
        </nav>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
