import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import './styles.css';
// Must come after styles.css — this is the Ink override layer.
import './styles/ink-app.css';
// Auth screens. Imported here rather than from InkAuthShell so the cascade
// order is stated in one place — .ink-button is shared with the app shell,
// and which file wins should not depend on module resolution order.
import './styles/ink-auth.css';
// Shell, Garage and Records surfaces. Loaded last so it wins over the rest.
import './styles/ink-garage.css';
// Vehicle page. Builds on ink-garage.css primitives, so it comes after.
import './styles/ink-vehicle.css';
// Landing composition and section rhythm. Overrides the .fig-* rules in
// styles.css without those needing to be edited in place.
import './styles/ink-landing.css';
// Adding a service record, and checking it before saving. Overrides the
// pre-Ink tokens in styles.css, and neutralises the bare `button` rules there
// and in ink-app.css that out-specify component classes.
//
// These last two sheets cover disjoint surfaces — the landing page and the
// add-record flow share no selectors — so their order relative to each other
// carries no meaning. Both merely need to come after styles.css.
import './styles/service-flow.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
