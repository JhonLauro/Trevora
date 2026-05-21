import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { isLoggedIn } from '../api/currentUser.js';

const vehicleFields = [
  ['Vehicle', 'Toyota Vios 2021 - ABC 1234', 'Verified', 'verified'],
  ['Service Date', 'May 7, 2026', 'High', 'high'],
  ['Service Type', 'Oil Change + Brake Service', 'High', 'high'],
  ['Total Cost', 'PHP 7,850', 'High', 'high'],
  ['Parts Replaced', 'Oil filter, Brake pads (F+R)', 'Medium', 'medium'],
  ['Work Performed', 'Oil drain and refill, pad install...', 'Low', 'low'],
];

const featureCards = [
  ['R', 'Receipt OCR', 'Point your camera at any shop receipt. Trevora extracts line items, totals, dates, and shop info automatically.'],
  ['V', 'Voice Capture', 'Speak your record on the way home. AI transcribes and structures it into a clean record instantly.'],
  ['C', 'Confidence Scoring', 'Every field is rated Verified, High, Medium, Low, or Not Found so there is no silent guessing.'],
  ['Q', 'Mechanic QR Access', 'Share a time-limited QR link with your mechanic. Full history, read-only, no app needed.'],
  ['S', 'Resale Ready', 'Prove your car history to buyers with a verified service timeline they can trust.'],
  ['A', 'AI Explanations', 'Trevora explains every service in plain language: what was done, why it matters, and what to watch for.'],
];

const howCards = [
  {
    number: '01',
    title: 'Capture Your Receipt',
    text: 'Snap a photo of your service receipt, record a voice memo at the shop, or type it in manually.',
    tags: ['Receipt OCR', 'Voice memo', 'Manual entry'],
    image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=900&h=520&fit=crop&auto=format',
  },
  {
    number: '02',
    title: 'AI Extracts Every Detail',
    text: 'Trevora pulls out service type, cost, parts, shop info, and confidence ratings for review.',
    tags: ['Field extraction', 'Confidence scoring', 'Auto-categorized'],
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=900&h=520&fit=crop&auto=format',
  },
  {
    number: '03',
    title: 'Your History, Forever',
    text: 'Every confirmed record is searchable, shareable, and ready for mechanic handoff.',
    tags: ['Searchable', 'Mechanic QR', 'PDF export'],
    image: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=900&h=520&fit=crop&auto=format',
  },
];

const confidenceRows = [
  ['Vehicle', 'Verified', 100, 'verified'],
  ['Service Date', 'High', 94, 'high'],
  ['Total Cost', 'High', 91, 'high'],
  ['Shop / Mechanic', 'Medium', 76, 'medium'],
  ['Parts Replaced', 'Medium', 63, 'medium'],
  ['Work Performed', 'Low', 38, 'low'],
  ['Odometer at Service', 'Not found', 0, 'missing'],
];

const faqs = [
  ['How accurate is the AI extraction from receipts?', 'Trevora works best with clear receipt photos. Every extracted field includes a confidence score so owners can quickly verify uncertain details before saving.'],
  ['What receipt formats are supported?', 'The MVP is designed around common auto shop receipts, itemized service slips, and owner-entered references. Manual entry remains available when a receipt is unclear.'],
  ['Is my vehicle data private and secure?', 'Owner workflows stay tied to the signed-in account. Mechanic access is temporary, read-only, and limited to the vehicle approved by the owner.'],
  ['Can I manage multiple vehicles?', 'Yes. Vehicle profiles keep separate service histories, record counts, costs, and mechanic access sessions.'],
  ['Does my mechanic need to install anything?', 'No. Mechanics use a shared access link or QR flow and only see approved read-only records.'],
];

const qrCells = Array.from({ length: 196 }, (_, index) => {
  const finder =
    (index < 42 && index % 14 < 6) ||
    (index < 42 && index % 14 > 8) ||
    (index > 140 && index % 14 < 6);
  return finder || (index * 17) % 5 === 0 || (index * 11) % 7 === 0;
});

function AppMockup() {
  return (
    <div className="fig-mockup">
      <div className="fig-browserbar">
        <span />
        <span />
        <span />
        <div>trevora.app/history/r1</div>
      </div>
      <div className="fig-appframe">
        <aside className="fig-mini-sidebar">
          <img src="/logo/tr.png" alt="" />
          <i />
          <i />
          <i className="active" />
          <i />
        </aside>
        <section className="fig-record-pane">
          <h2>Oil Change + Brake Service</h2>
          <div className="fig-badges">
            <span>Validated</span>
            <span>Receipt + AI</span>
            <span>May 7, 2026</span>
          </div>
          {vehicleFields.map(([label, value, confidence, tone]) => (
            <div className="fig-field-row" key={label}>
              <div>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
              <em className={`fig-${tone}`}>{confidence}</em>
            </div>
          ))}
        </section>
        <section className="fig-ai-pane">
          <small>AI EXPLANATION</small>
          <p>Regular oil changes prevent sludge buildup and protect your engine from long-term wear.</p>
          <div>What was done</div>
          <div>Why it matters</div>
          <div>Watch for</div>
        </section>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const signedIn = isLoggedIn();
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <main className="fig-page">
      <nav className="fig-nav" aria-label="Landing navigation">
        <Link className="fig-brand" to="/">
          <span><img src="/logo/tr.png" alt="" /></span>
          Trevora
        </Link>
        <div className="fig-nav-links">
          <a href="#features">Features</a>
          <a href="#workflow">How It Works</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="fig-nav-actions">
          <Link className="fig-signin" to="/login">Sign in</Link>
          <Link className="fig-primary" to={signedIn ? '/dashboard' : '/register'}>
            {signedIn ? 'Open App' : 'Get Started Free'}
          </Link>
        </div>
      </nav>

      <section className="fig-hero">
        <div className="fig-hero-copy">
          <span className="fig-pill">AI-Powered Vehicle Intelligence</span>
          <h1>Every Service.<br />Every Detail.<br /><strong>Never Forgotten.</strong></h1>
          <p>Trevora turns your receipts, voice memos, and manual notes into a complete, AI-verified vehicle maintenance record: searchable, shareable, and built to last.</p>
          <div className="fig-actions">
            <Link className="fig-primary fig-large" to={signedIn ? '/dashboard' : '/register'}>Get Started Free <span>→</span></Link>
            <a className="fig-secondary fig-large" href="#workflow">See it in action</a>
          </div>
        </div>
        <AppMockup />
      </section>

      <section className="fig-trust" aria-label="Trust details">
        <span>No credit card required</span>
        <span>Bank-level encryption</span>
        <span>Private by default</span>
        <span>Export anytime</span>
      </section>

      <section id="workflow" className="fig-how">
        <div className="fig-section-heading">
          <span className="fig-pill">Simple as 1-2-3</span>
          <h2>From receipt to record in under a minute</h2>
          <p>Capture right after your service visit. Trevora handles the rest automatically.</p>
        </div>
        <div className="fig-how-grid">
          {howCards.map((card) => (
            <article className="fig-how-card" key={card.number}>
              <div className="fig-how-image" style={{ backgroundImage: `url(${card.image})` }}>
                <span>{card.number}</span>
              </div>
              <div className="fig-how-body">
                <h3>{card.title}</h3>
                <p>{card.text}</p>
                <div>{card.tags.map((tag) => <small key={tag}>{tag}</small>)}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="fig-features">
        <div className="fig-section-heading fig-dark-heading">
          <span className="fig-pill dark">Built for car owners</span>
          <h2>Everything your service history actually deserves</h2>
        </div>
        <div className="fig-feature-grid">
          {featureCards.map(([icon, title, text]) => (
            <article className="fig-feature-card" key={title}>
              <span>{icon}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="fig-ai-section">
        <div className="fig-confidence-card">
          <div className="fig-confidence-head"><span /> AI Extraction · receipt_may07.jpg <strong>Complete</strong></div>
          <div className="fig-confidence-badges"><span>Verified:1</span><span>High:2</span><span>Medium:2</span><span>Low:1</span><span>Not found:1</span></div>
          {confidenceRows.map(([label, status, percent, tone]) => (
            <div className="fig-confidence-row" key={label}>
              <div><span>{label}</span><strong>{status}</strong></div>
              <div><i className={`fig-bar-${tone}`} style={{ width: `${percent}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="fig-ai-copy">
          <span className="fig-pill violet">AI-powered extraction</span>
          <h2>You always know how confident the AI is</h2>
          <p>Every extracted field carries a live confidence rating. Trevora tells you when it is certain and flags when it needs your help.</p>
          <ul>
            <li>Verified fields backed by OCR cross-reference</li>
            <li>Low-confidence fields highlighted for quick review</li>
            <li>Missing data clearly shown, never silently dropped</li>
          </ul>
        </div>
      </section>

      <section className="fig-mechanic">
        <div className="fig-mechanic-copy">
          <span className="fig-pill amber">Instant Mechanic Access</span>
          <h2>Your mechanic sees exactly what they need to</h2>
          <p>Generate a time-limited QR code that gives your mechanic read-only access to your full service history. No login, no app, no friction.</p>
          <ul>
            <li>No app download required for the mechanic</li>
            <li>Access expires automatically, you control the duration</li>
            <li>Read-only: mechanics can browse, never edit</li>
            <li>Built-in AI assistant helps them find what they need</li>
          </ul>
          <a className="fig-primary fig-large" href="#faq">Try mechanic view <span>→</span></a>
        </div>
        <div className="fig-qr-card">
          <div className="fig-qr-head"><span>Trevora · Mechanic View<small>Toyota Vios 2021 · ABC 1234</small></span><em>Read-only</em></div>
          <div className="fig-qr-grid">{qrCells.map((on, index) => <i className={on ? 'on' : ''} key={index} />)}</div>
          <div className="fig-qr-foot"><span>Expires in<strong>1h 47m</strong></span><span>Records<strong>5</strong></span><button>Share QR</button></div>
        </div>
      </section>

      <section id="faq" className="fig-faq">
        <h2>Frequently asked</h2>
        <div className="fig-faq-list">
          {faqs.map(([question, answer], index) => (
            <button className={`fig-faq-item ${openFaq === index ? 'open' : ''}`} key={question} type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
              <strong>{question}<span>{openFaq === index ? '⌃' : '⌄'}</span></strong>
              {openFaq === index && <p>{answer}</p>}
            </button>
          ))}
        </div>
      </section>

      <section className="fig-final-cta">
        <div>
          <h2>Start building your vehicle's permanent service record today</h2>
          <p>Free to start. No credit card required.</p>
          <Link className="fig-primary fig-large" to={signedIn ? '/dashboard' : '/register'}>Get Started Free <span>→</span></Link>
        </div>
      </section>

      <footer className="fig-footer">
        <div><strong>Trevora</strong><p>The intelligent vehicle service record companion for car owners who care about their investment.</p></div>
        <div><strong>Product</strong><a>Features</a><a>How It Works</a><a>Roadmap</a></div>
        <div><strong>Company</strong><a>About</a><a>Blog</a><a>Contact</a></div>
        <div><strong>Legal</strong><a>Privacy Policy</a><a>Terms of Service</a><a>Security</a></div>
      </footer>
    </main>
  );
}
