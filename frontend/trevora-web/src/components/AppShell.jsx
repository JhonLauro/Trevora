import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import {
  clearLoggedInUser,
  getActiveCurrentUser,
  getCurrentDemoUser,
  getUserDisplayName,
  isLoggedIn,
} from '../api/currentUser.js';
import { getVehicles } from '../api/vehicles.js';

const VEHICLE_LABEL_KEY = 'trevora.activeVehicleLabel';
const VEHICLE_SUBTITLE_KEY = 'trevora.activeVehicleSubtitle';

function getActiveVehiclePath() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  return activeVehicleId ? `/service-input/${activeVehicleId}` : '/vehicles';
}

function getActiveHistoryPath() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  return activeVehicleId ? `/vehicles/${activeVehicleId}/history` : '/vehicles';
}

function getActiveSharePath() {
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId');
  return activeVehicleId ? `/vehicles/${activeVehicleId}/share` : '/vehicles';
}

function getActiveVehicleLabel() {
  return window.localStorage.getItem(VEHICLE_LABEL_KEY) || 'Select vehicle';
}

function getActiveVehicleSubtitle() {
  return window.localStorage.getItem(VEHICLE_SUBTITLE_KEY) || 'No active vehicle';
}

function displayVehicleName(vehicle) {
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function displayVehicleSubtitle(vehicle) {
  return vehicle.plateNumber || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Registered vehicle';
}

export default function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(getActiveCurrentUser);
  const [authenticated, setAuthenticated] = useState(isLoggedIn);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [activeVehicleLabel, setActiveVehicleLabel] = useState(getActiveVehicleLabel);
  const [activeVehicleSubtitle, setActiveVehicleSubtitle] = useState(getActiveVehicleSubtitle);
  const addServicePath = getActiveVehiclePath();
  const serviceHistoryPath = getActiveHistoryPath();
  const shareAccessPath = getActiveSharePath();
  const canUseOwnerWorkflows = currentUser.role === 'VEHICLE_OWNER';

  useEffect(() => {
    setActiveVehicleLabel(getActiveVehicleLabel());
    setActiveVehicleSubtitle(getActiveVehicleSubtitle());
  }, [location.pathname]);

  useEffect(() => {
    if (!canUseOwnerWorkflows) return undefined;
    let active = true;
    getVehicles()
      .then((data) => {
        if (!active) return;
        setVehicles(data);
        const currentId = window.localStorage.getItem('trevora.activeVehicleId');
        const currentVehicle = data.find((vehicle) => vehicle.vehicleId === currentId);
        const fallbackVehicle = currentVehicle ?? data[0];
        if (fallbackVehicle && currentVehicle == null) {
          setActiveVehicle(fallbackVehicle);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [canUseOwnerWorkflows]);

  function setActiveVehicle(vehicle) {
    const label = displayVehicleName(vehicle);
    const subtitle = displayVehicleSubtitle(vehicle);
    window.localStorage.setItem('trevora.activeVehicleId', vehicle.vehicleId);
    window.localStorage.setItem(VEHICLE_LABEL_KEY, label);
    window.localStorage.setItem(VEHICLE_SUBTITLE_KEY, subtitle);
    setActiveVehicleLabel(label);
    setActiveVehicleSubtitle(subtitle);
    setVehicleMenuOpen(false);
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
          <span className="brand-icon">⌁</span>
          <strong>Trevora</strong>
        </div>

        {canUseOwnerWorkflows && (
          <div className="active-vehicle-panel">
            <span>Active vehicle</span>
            <button
              className="active-vehicle-card"
              type="button"
              onClick={() => setVehicleMenuOpen((open) => !open)}
            >
              <span className="nav-icon">⌁</span>
              <span>
                <strong>{activeVehicleLabel}</strong>
                <small>{activeVehicleSubtitle}</small>
              </span>
              <span className="vehicle-caret">{vehicleMenuOpen ? '⌃' : '⌄'}</span>
            </button>

            {vehicleMenuOpen && (
              <div className="active-vehicle-menu">
                {vehicles.length === 0 ? (
                  <Link to="/vehicles" onClick={() => setVehicleMenuOpen(false)}>
                    Add or select a vehicle
                  </Link>
                ) : (
                  vehicles.map((vehicle) => (
                    <button
                      key={vehicle.vehicleId}
                      type="button"
                      onClick={() => setActiveVehicle(vehicle)}
                    >
                      <strong>{displayVehicleName(vehicle)}</strong>
                      <small>{displayVehicleSubtitle(vehicle)}</small>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <nav className="side-nav" aria-label="Primary">
          {canUseOwnerWorkflows && (
            <>
              <NavLink to="/dashboard">
                <span className="nav-icon">□</span>
                Dashboard
              </NavLink>
              <NavLink to="/vehicles" end>
                <span className="nav-icon">⌁</span>
                My Vehicles
              </NavLink>
            </>
          )}
          {canUseOwnerWorkflows && (
            <NavLink
              className={location.pathname.startsWith('/service-input') ? 'active' : undefined}
              to={addServicePath}
              title={addServicePath === '/vehicles' ? 'Select a vehicle first' : 'Add a service record'}
            >
              <span className="nav-icon">⊕</span>
              Add Service Record
            </NavLink>
          )}
          {canUseOwnerWorkflows && (
            <NavLink
              className={location.pathname.includes('/history') ? 'active' : undefined}
              to={serviceHistoryPath}
              title={serviceHistoryPath === '/vehicles' ? 'Select a vehicle first' : 'View service history'}
            >
              <span className="nav-icon">↺</span>
              Service History
            </NavLink>
          )}
          {canUseOwnerWorkflows && (
            <NavLink
              className={location.pathname.includes('/share') || location.pathname.startsWith('/access/requests') ? 'active' : undefined}
              to={shareAccessPath}
              title={shareAccessPath === '/vehicles' ? 'Select a vehicle first' : 'Share mechanic access'}
            >
              <span className="nav-icon">⌘</span>
              Shared Access
            </NavLink>
          )}
          {canUseOwnerWorkflows && (
            <>
              <NavLink to="/notifications" className="sidebar-nav-link">
                <span className="nav-icon">♧</span>
                Notifications
                <span className="notification-pill">3</span>
              </NavLink>
              <NavLink to="/account-settings" className="sidebar-nav-link">
                <span className="nav-icon">⚙</span>
                Account Settings
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-user-panel">
          <div className="sidebar-user-card">
            <span className="user-avatar">⌾</span>
            <span>
              <strong>{authenticated ? getUserDisplayName(currentUser) : getCurrentDemoUser().label}</strong>
              <small>{authenticated ? currentUser.email : currentUser.role.replace('_', ' ')}</small>
            </span>
          </div>

          <button className="sidebar-signout-button" type="button" onClick={handleLogout}>
            ↪ Sign out
          </button>
        </div>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
