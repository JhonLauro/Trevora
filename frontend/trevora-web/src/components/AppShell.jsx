import { Link, NavLink, useLocation } from 'react-router-dom';
import React, { useState } from 'react';
import {
  clearLoggedInUser,
  DEMO_USERS,
  getActiveCurrentUser,
  getCurrentDemoUser,
  isLoggedIn,
  setCurrentDemoUser,
} from '../api/currentUser.js';

function getActiveVehiclePath() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  return activeVehicleId ? `/service-input/${activeVehicleId}` : '/vehicles';
}

function getActiveHistoryPath() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  return activeVehicleId ? `/vehicles/${activeVehicleId}/history` : '/vehicles';
}

function moduleContextFor(pathname) {
  if (pathname === '/mechanic' || pathname.startsWith('/mechanic/')) {
    return { number: 'Module 4', label: 'Mechanic Access' };
  }
  if (
    pathname === '/access' ||
    pathname.startsWith('/access/') ||
    /^\/vehicles\/[^/]+\/share\/?$/.test(pathname)
  ) {
    return { number: 'Module 4', label: 'Mechanic Handoff' };
  }
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
  const [currentUser, setCurrentUser] = useState(getActiveCurrentUser);
  const [authenticated, setAuthenticated] = useState(isLoggedIn);
  const addServicePath = getActiveVehiclePath();
  const serviceHistoryPath = getActiveHistoryPath();
  const moduleContext = moduleContextFor(location.pathname);
  const canUseOwnerWorkflows = currentUser.role === 'VEHICLE_OWNER';

  function handleDemoUserChange(event) {
    setCurrentUser(setCurrentDemoUser(event.target.value));
    window.location.reload();
  }

  function handleLogout() {
    clearLoggedInUser();
    setAuthenticated(false);
    setCurrentUser(getCurrentDemoUser());
    window.location.assign('/login');
  }

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

        {authenticated ? (
          <div className="demo-user-selector">
            <span>Signed in</span>
            <strong>{currentUser.fullName}</strong>
            <small>{currentUser.role.replace('_', ' ')}</small>
            <button className="sidebar-secondary-button" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        ) : (
          <div className="demo-user-selector">
            <span>Auth</span>
            <div className="auth-link-row">
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </div>
            <label>
              Demo user
              <select value={currentUser.userId} onChange={handleDemoUserChange}>
                {DEMO_USERS.map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
            <small>{currentUser.role.replace('_', ' ')}</small>
          </div>
        )}

        <nav className="side-nav" aria-label="Primary">
          <NavLink to="/vehicles">My Vehicles</NavLink>
          {canUseOwnerWorkflows && (
            <NavLink
              className={location.pathname.startsWith('/service-input') ? 'active' : undefined}
              to={addServicePath}
              title={addServicePath === '/vehicles' ? 'Select a vehicle first' : 'Add a service record'}
            >
              Add Service Record
            </NavLink>
          )}
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
