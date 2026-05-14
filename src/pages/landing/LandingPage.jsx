import { Link } from 'react-router-dom';
import './LandingPage.css';

const captureMethods = [
  ['Receipt image upload', 'Extract service date, service type, parts, shop, cost, and remarks from a receipt photo.'],
  ['Voice input', 'Convert spoken service information into structured service details for review.'],
  ['Manual entry', 'Enter required service fields directly when receipt or voice input is not available.'],
];

const workflow = [
  'Create or select a registered vehicle profile.',
  'Submit service information through receipt, voice, or manual entry.',
  'Review extracted details and correct missing or inaccurate fields.',
  'Save the validated record under the correct vehicle history.',
];

const LandingPage = () => {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link to="/" className="landing-logo" aria-label="Trevora home">
          <span>▰</span>
          <strong>Trevora</strong>
        </Link>
        <nav aria-label="Primary navigation">
          <a href="#input">Service input</a>
          <a href="#workflow">Workflow</a>
          <a href="#handoff">Mechanic handoff</a>
          <Link to="/login">Sign in</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">AI-assisted vehicle service history consolidation</p>
          <h1>Vehicle service history made clear.</h1>
          <p>
            Trevora helps vehicle owners capture, validate, consolidate, understand, and share
            maintenance and repair records under the correct vehicle profile.
          </p>
          <div className="landing-actions">
            <Link to="/login" className="primary-link">Sign in</Link>
            <Link to="/register" className="secondary-link">Create account</Link>
          </div>
        </div>

        <aside className="hero-preview" aria-label="Service record workflow preview">
          <div className="preview-top">
            <span>Toyota Vios 2021</span>
            <strong>24 records</strong>
          </div>
          <div className="preview-card selected">
            <small>Current draft</small>
            <h2>Oil Change + Brake Service</h2>
            <dl>
              <div><dt>Source</dt><dd>Receipt</dd></div>
              <div><dt>Status</dt><dd>Needs review</dd></div>
              <div><dt>Cost</dt><dd>PHP 7,850</dd></div>
            </dl>
          </div>
          <div className="preview-note">
            <strong>Owner validation required</strong>
            <p>Extracted details are reviewed and corrected before they become part of the vehicle history.</p>
          </div>
        </aside>
      </section>

      <section className="landing-section" id="input">
        <div className="section-heading">
          <p className="eyebrow">Module 1</p>
          <h2>Service record input starts with the vehicle owner.</h2>
          <p>
            The owner selects a registered vehicle first, then chooses the input method that best
            matches the record they have.
          </p>
        </div>
        <div className="capture-grid">
          {captureMethods.map(([title, body]) => (
            <article key={title}>
              <span />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div>
          <p className="eyebrow">Core workflow</p>
          <h2>From scattered record to validated service history.</h2>
        </div>
        <ol>
          {workflow.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section className="handoff-section" id="handoff">
        <div>
          <p className="eyebrow">Owner-controlled sharing</p>
          <h2>Mechanics only get temporary read-only access after approval.</h2>
          <p>
            Trevora is not shop-centered. Vehicle owners control their records, generate one-time
            QR access, and approve mechanic requests before any service history is shared.
          </p>
        </div>
        <div className="handoff-card">
          <strong>QR handoff rules</strong>
          <ul>
            <li>One-time access request</li>
            <li>Owner approval required</li>
            <li>Temporary read-only mechanic view</li>
            <li>AI search uses only approved shared history</li>
          </ul>
        </div>
      </section>
    </main>
  );
};

export default LandingPage;
