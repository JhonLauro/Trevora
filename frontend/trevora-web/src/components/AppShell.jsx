import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import {
  Bell,
  Car,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  History,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  Share2,
  UserCircle,
} from 'lucide-react';
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
  notifyActiveVehicleChanged,
  setActiveVehicleSelection,
} from '../api/activeVehicle.js';
import { getPendingMechanicAccessRequests } from '../api/qrAccess.js';
import { getVehicles } from '../api/vehicles.js';
import BrandLogo from './BrandLogo.jsx';

const SIDEBAR_COLLAPSED_KEY = 'trevora.sidebarCollapsed';

function getActiveVehiclePath(activeVehicleId) {
  return activeVehicleId ? `/service-input/${activeVehicleId}` : '/vehicles';
}

function getActiveHistoryPath(activeVehicleId) {
  return activeVehicleId ? `/vehicles/${activeVehicleId}/history` : '/vehicles';
}

function getActiveSharePath(activeVehicleId) {
  return activeVehicleId ? `/vehicles/${activeVehicleId}/share` : '/vehicles';
}

function nextPathForVehicle(pathname, vehicleId) {
  if (!vehicleId) return null;
  if (pathname === '/dashboard') return null;
  if (/^\/vehicles\/[^/]+\/history(?:\/[^/]+)?$/.test(pathname)) {
    return `/vehicles/${vehicleId}/history`;
  }
  if (/^\/vehicles\/[^/]+\/share$/.test(pathname)) {
    return `/vehicles/${vehicleId}/share`;
  }
  if (/^\/service-input\/[^/]+(?:\/(?:manual|receipt|voice))?$/.test(pathname)) {
    return pathname.replace(/^\/service-input\/[^/]+/, `/service-input/${vehicleId}`);
  }
  return null;
}

export default function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(getActiveCurrentUser);
  const [authenticated, setAuthenticated] = useState(isLoggedIn);
  const [vehicles, setVehicles] = useState([]);
  const [pendingNotificationCount, setPendingNotificationCount] = useState(0);
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  const [activeVehicleId, setActiveVehicleId] = useState(getActiveVehicleId);
  const [activeVehicleLabel, setActiveVehicleLabel] = useState(getActiveVehicleLabel);
  const [activeVehicleSubtitle, setActiveVehicleSubtitle] = useState(getActiveVehicleSubtitle);
  const addServicePath = getActiveVehiclePath(activeVehicleId);
  const serviceHistoryPath = getActiveHistoryPath(activeVehicleId);
  const shareAccessPath = getActiveSharePath(activeVehicleId);
  const canUseOwnerWorkflows = currentUser?.role === 'VEHICLE_OWNER';

  useEffect(() => {
    setActiveVehicleId(getActiveVehicleId());
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
            setActiveVehicleId(getActiveVehicleId());
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
    setActiveVehicleId(vehicle.vehicleId);
    setActiveVehicleLabel(displayVehicleName(vehicle));
    setActiveVehicleSubtitle(displayVehicleSubtitle(vehicle));
    if (closeMenu) {
      setVehicleMenuOpen(false);
    }
  }

  function handleVehicleSelection(vehicle) {
    setActiveVehicle(vehicle);
    notifyActiveVehicleChanged(vehicle);
    const nextPath = nextPathForVehicle(location.pathname, vehicle.vehicleId);
    if (nextPath && nextPath !== location.pathname) {
      navigate(nextPath);
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      if (next) {
        setVehicleMenuOpen(false);
      }
      return next;
    });
  }

  function handleLogout() {
    clearLoggedInUser();
    setAuthenticated(false);
    setCurrentUser(null);
    window.location.assign('/login');
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar">
        <div className="brand-mark">
          <BrandLogo variant="light" className="brand-logo" />
          <button
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="sidebar-collapse-button"
            type="button"
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
          </button>
        </div>

        {canUseOwnerWorkflows && (
          <div className="active-vehicle-panel">
            <span>Active vehicle</span>
            <button
              className="active-vehicle-card"
              type="button"
              title={sidebarCollapsed ? `${activeVehicleLabel} - ${activeVehicleSubtitle}` : undefined}
              onClick={() => {
                if (!vehicleMenuOpen) {
                  window.dispatchEvent(new Event('trevora:vehicles-changed'));
                }
                setVehicleMenuOpen((open) => !open);
              }}
            >
              <span className="nav-icon">
                <Car size={18} aria-hidden="true" />
              </span>
              <span className="active-vehicle-copy">
                <strong>{activeVehicleLabel}</strong>
                <small>{activeVehicleSubtitle}</small>
              </span>
              <span className="vehicle-caret">
                {vehicleMenuOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
              </span>
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
                      className={vehicle.vehicleId === activeVehicleId ? 'selected' : undefined}
                      key={vehicle.vehicleId}
                      type="button"
                      onClick={() => handleVehicleSelection(vehicle)}
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
              <NavLink to="/dashboard" title="Dashboard">
                <span className="nav-icon">
                  <LayoutDashboard size={18} aria-hidden="true" />
                </span>
                <span className="nav-label">Dashboard</span>
              </NavLink>
              <NavLink to="/vehicles" end title="My Vehicles">
                <span className="nav-icon">
                  <Car size={18} aria-hidden="true" />
                </span>
                <span className="nav-label">My Vehicles</span>
              </NavLink>
            </>
          )}
          {canUseOwnerWorkflows && (
            <NavLink
              className={location.pathname.startsWith('/service-input') ? 'active' : undefined}
              to={addServicePath}
              title={addServicePath === '/vehicles' ? 'Select a vehicle first' : 'Add a service record'}
            >
              <span className="nav-icon">
                <PlusCircle size={18} aria-hidden="true" />
              </span>
              <span className="nav-label">Add Service Record</span>
            </NavLink>
          )}
          {canUseOwnerWorkflows && (
            <NavLink
              className={location.pathname.includes('/history') ? 'active' : undefined}
              to={serviceHistoryPath}
              title={serviceHistoryPath === '/vehicles' ? 'Select a vehicle first' : 'View service history'}
            >
              <span className="nav-icon">
                <History size={18} aria-hidden="true" />
              </span>
              <span className="nav-label">Service History</span>
            </NavLink>
          )}
          {canUseOwnerWorkflows && (
            <NavLink
              className={location.pathname.includes('/share') || location.pathname.startsWith('/access/requests') ? 'active' : undefined}
              to={shareAccessPath}
              title={shareAccessPath === '/vehicles' ? 'Select a vehicle first' : 'Share mechanic access'}
            >
              <span className="nav-icon">
                <Share2 size={18} aria-hidden="true" />
              </span>
              <span className="nav-label">Shared Access</span>
            </NavLink>
          )}
          {canUseOwnerWorkflows && (
            <>
              <NavLink to="/notifications" className="sidebar-nav-link" title="Notifications">
                <span className="nav-icon">
                  <Bell size={18} aria-hidden="true" />
                </span>
                <span className="nav-label">Notifications</span>
                {pendingNotificationCount > 0 && (
                  <span className="notification-pill">{pendingNotificationCount}</span>
                )}
              </NavLink>
              <NavLink to="/account-settings" className="sidebar-nav-link" title="Account Settings">
                <span className="nav-icon">
                  <Settings size={18} aria-hidden="true" />
                </span>
                <span className="nav-label">Account Settings</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-user-panel">
          <div className="sidebar-user-card">
            <span className="user-avatar">
              <UserCircle size={22} aria-hidden="true" />
            </span>
            <span className="sidebar-user-copy">
              <strong>{authenticated ? getUserDisplayName(currentUser) : 'Signed out'}</strong>
              <small>{authenticated ? currentUser?.email : 'Authentication required'}</small>
            </span>
          </div>

          <button className="sidebar-signout-button" type="button" onClick={handleLogout} title="Sign out">
            <LogOut size={18} aria-hidden="true" /> <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
