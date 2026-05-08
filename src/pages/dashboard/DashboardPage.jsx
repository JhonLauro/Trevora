import { useAuth } from '../../context/AuthContext';
import './DashboardPage.css';

const DashboardPage = () => {
  const { user, logout } = useAuth();

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p>Trevora</p>
          <h1>Welcome, {user?.fullName || 'traveler'}</h1>
        </div>
        <button type="button" onClick={logout}>Sign out</button>
      </header>
      <section className="dashboard-panel">
        <h2>Account ready</h2>
        <p>
          Login and registration are connected. The next Trevora modules can build from this
          authenticated dashboard.
        </p>
      </section>
    </main>
  );
};

export default DashboardPage;
