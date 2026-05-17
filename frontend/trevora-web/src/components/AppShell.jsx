import { NavLink, useLocation } from 'react-router-dom';

function getActiveVehiclePath() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  return activeVehicleId ? `/service-input/${activeVehicleId}` : '/vehicles';
}

function getActiveHistoryPath() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  return activeVehicleId ? `/vehicles/${activeVehicleId}/history` : '/vehicles';
}

function moduleContextFor(pathname) {
  if (pathname.includes('/history')) {
    return { number: 'Module 3', label: 'Service History' };
  }
  if (pathname.includes('/review') || pathname.includes('/correct') || pathname.includes('/confirm') || pathname.includes('/saved')) {
    return { number: 'Module 2', label: 'Validation and Correction' };
  }
  return { number: 'Module 1', label: 'Service Record Input' };
}

export default function AppShell({ children }) {
  const location = useLocation();
  const addServicePath = getActiveVehiclePath();
  const serviceHistoryPath = getActiveHistoryPath();
  const moduleContext = moduleContextFor(location.pathname);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-mark">
          <span className="brand-icon">T</span>
          <strong>Trevora</strong>
        </div>

        <div className="module-chip">
          <span>Active module</span>
          <strong>{moduleContext.number}</strong>
          <small>{moduleContext.label}</small>
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
          <NavLink
            className={location.pathname.includes('/history') ? 'active' : undefined}
            to={serviceHistoryPath}
            title={serviceHistoryPath === '/vehicles' ? 'Select a vehicle first' : 'View service history'}
          >
            Service History
          </NavLink>
        </nav>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
