import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import {
  clearLoggedInUser,
  getActiveCurrentUser,
  getUserDisplayName,
  isLoggedIn,
} from '../api/currentUser.js';
import {
  clearActiveVehicleSelection,
  displayVehicleName,
  displayVehicleSubtitle,
  getActiveVehicleId,
  getActiveVehicleLabel,
  getActiveVehicleSubtitle,
  setActiveVehicleSelection,
} from '../api/activeVehicle.js';
import { getPendingMechanicAccessRequests } from '../api/qrAccess.js';
import { getVehicles } from '../api/vehicles.js';
import BrandLogo from './BrandLogo.jsx';

function getActiveVehiclePath() {
  const activeVehicleId = getActiveVehicleId();
  return activeVehicleId ? `/service-input/${activeVehicleId}` : '/vehicles';
}

function getActiveHistoryPath() {
  const activeVehicleId = getActiveVehicleId();
  return activeVehicleId ? `/vehicles/${activeVehicleId}/history` : '/vehicles';
}

function getActiveSharePath() {
  const activeVehicleId = getActiveVehicleId();
  return activeVehicleId ? `/vehicles/${activeVehicleId}/share` : '/vehicles';
}

export default function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(getActiveCurrentUser);
  const [authenticated, setAuthenticated] = useState(isLoggedIn);
  const [vehicles, setVehicles] = useState([]);
  const [pendingNotificationCount, setPendingNotificationCount] = useState(0);
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [activeVehicleLabel, setActiveVehicleLabel] = useState(getActiveVehicleLabel);
  const [activeVehicleSubtitle, setActiveVehicleSubtitle] = useState(getActiveVehicleSubtitle);
  const addServicePath = getActiveVehiclePath();
  const serviceHistoryPath = getActiveHistoryPath();
  const shareAccessPath = getActiveSharePath();
  const canUseOwnerWorkflows = currentUser?.role === 'VEHICLE_OWNER';

  useEffect(() => {
    setActiveVehicleLabel(getActiveVehicleLabel());
    setActiveVehicleSubtitle(getActiveVehicleSubtitle());
  }, [location.pathname]);

  useEffect(() => {
    if (!canUseOwnerWorkflows) return undefined;
    let active = true;

    function loadVehicles() {
      getVehicles()
      .then((data) => {
        if (!active) return;
        setVehicles(data);
        const currentId = getActiveVehicleId();
        const currentVehicle = data.find((vehicle) => vehicle.vehicleId === currentId);
        const fallbackVehicle = currentVehicle ?? data[0];
        if (fallbackVehicle) {
          setActiveVehicle(fallbackVehicle, false);
        } else {
          clearActiveVehicleSelection();
          setActiveVehicleLabel(getActiveVehicleLabel());
          setActiveVehicleSubtitle(getActiveVehicleSubtitle());
        }
      })
      .catch(() => {});
    }

    loadVehicles();
    window.addEventListener('trevora:vehicles-changed', loadVehicles);

    return () => {
      active = false;
      window.removeEventListener('trevora:vehicles-changed', loadVehicles);
    };
  }, [canUseOwnerWorkflows, location.pathname]);

  useEffect(() => {
    if (!canUseOwnerWorkflows) {
      setPendingNotificationCount(0);
      return undefined;
    }

    let active = true;
    getPendingMechanicAccessRequests()
      .then((data) => {
        if (active) setPendingNotificationCount(data.length);
      })
      .catch(() => {
        if (active) setPendingNotificationCount(0);
      });

    return () => {
      active = false;
    };
  }, [canUseOwnerWorkflows, location.pathname]);

  function setActiveVehicle(vehicle, closeMenu = true) {
    setActiveVehicleSelection(vehicle);
    setActiveVehicleLabel(displayVehicleName(vehicle));
    setActiveVehicleSubtitle(displayVehicleSubtitle(vehicle));
    if (closeMenu) {
      setVehicleMenuOpen(false);
    }
  }

  function handleLogout() {
    clearLoggedInUser();
    setAuthenticated(false);
    setCurrentUser(null);
    window.location.assign('/login');
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-mark">
          <BrandLogo variant="light" className="brand-logo" />
        </div>

        {canUseOwnerWorkflows && (
          <div className="active-vehicle-panel">
            <span>Active vehicle</span>
            <button
              className="active-vehicle-card"
              type="button"
              onClick={() => {
                if (!vehicleMenuOpen) {
                  window.dispatchEvent(new Event('trevora:vehicles-changed'));
                }
                setVehicleMenuOpen((open) => !open);
              }}
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
                      className={vehicle.vehicleId === getActiveVehicleId() ? 'selected' : undefined}
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
                {pendingNotificationCount > 0 && (
                  <span className="notification-pill">{pendingNotificationCount}</span>
                )}
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
              <strong>{authenticated ? getUserDisplayName(currentUser) : 'Signed out'}</strong>
              <small>{authenticated ? currentUser?.email : 'Authentication required'}</small>
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
