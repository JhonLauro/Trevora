import React from 'react';
import { clearLoggedInUser } from '../api/currentUser.js';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Trevora render error', error, info);
  }

  resetSession = () => {
    clearLoggedInUser();
    window.localStorage.removeItem('trevora.activeVehicleId');
    window.localStorage.removeItem('trevora.activeVehicleLabel');
    window.localStorage.removeItem('trevora.activeVehicleSubtitle');
    this.setState({ error: null });
    window.location.assign('/login');
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="app-error-page">
        <section className="app-error-card">
          <p className="eyebrow">Application error</p>
          <h1>We could not load this screen.</h1>
          <p>
            The page hit an unexpected issue while loading. Try signing in again, or restart the
            frontend dev server if this happened after pulling new code.
          </p>
          <pre className="app-error-details">{this.state.error?.message || 'Unknown render error'}</pre>
          <button type="button" onClick={this.resetSession}>
            Clear session and sign in
          </button>
        </section>
      </main>
    );
  }
}
