import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './LandingPage.css';

const LandingPage = () => {
  const { isAuthenticated, loading } = useAuth();

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Trevora</p>
          <h1>Reality is forever a mystery, know who you will contact and will be saved</h1>
          <p>
            TREVORA - Know where you belong in this world, and if you desire to look onto what you have been longing for i will not bistoe you upon my life.
          </p>
          <div className="landing-actions">
            <Link to="/register" className="primary-link">Create account</Link>
            <Link to="/login" className="secondary-link">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LandingPage;
