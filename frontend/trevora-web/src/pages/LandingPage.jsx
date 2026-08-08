import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Cpu,
  Download,
  Eye,
  History,
  Lock,
  Mic,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
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
  [ScanLine, 'Receipt OCR', 'Point your camera at any shop receipt. Trevora extracts line items, totals, dates, and shop info automatically.'],
  [Mic, 'Voice Capture', 'Speak your record on the way home. AI transcribes and structures it into a clean record instantly.'],
  [ShieldCheck, 'Confidence Scoring', 'Every field is rated Verified, High, Medium, Low, or Not Found so there is no silent guessing.'],
  [QrCode, 'Mechanic QR Access', 'Share a time-limited QR link with your mechanic. Full history, read-only, no app needed.'],
  [TrendingUp, 'Resale Ready', 'Prove your car history to buyers with a verified service timeline they can trust.'],
  [Sparkles, 'AI Explanations', 'Trevora explains every service in plain language: what was done, why it matters, and what to watch for.'],
];

const howCards = [
  {
    number: '01',
    icon: Camera,
    title: 'Capture Your Receipt',
    text: 'Snap a photo of your service receipt, record a voice memo at the shop, or type it in manually.',
    tags: ['Receipt OCR', 'Voice memo', 'Manual entry'],
  },
  {
    number: '02',
    icon: Cpu,
    title: 'AI Extracts Every Detail',
    text: 'Trevora pulls out service type, cost, parts, shop info, and confidence ratings for review.',
    tags: ['Field extraction', 'Confidence scoring', 'Auto-categorized'],
  },
  {
    number: '03',
    icon: History,
    title: 'Your History, Forever',
    text: 'Every confirmed record is searchable, shareable, and ready for mechanic handoff.',
    tags: ['Searchable', 'Mechanic QR', 'PDF export'],
  },
];

const confidenceRows = [
  ['Vehicle', 'Verified', 100, 'verified'],
  ['Service Date', 'High', 94, 'high'],
  ['Total Cost', 'High', 91, 'high'],
  ['Shop Name', 'Medium', 76, 'medium'],
  ['Parts Replaced', 'Medium', 63, 'medium'],
  ['Work Performed', 'Low', 38, 'low'],
  ['Odometer at Service', 'Not found', 0, 'missing'],
];

const confidenceBadges = [
  ['Verified', 1, 'verified'],
  ['High', 2, 'high'],
  ['Medium', 2, 'medium'],
  ['Low', 1, 'low'],
  ['Not found', 1, 'missing'],
];

const trustPoints = [
  [Check, 'No credit card required'],
  [Lock, 'Bank-level encryption'],
  [ShieldCheck, 'Private by default'],
  [Download, 'Export anytime'],
];

const aiPoints = [
  'Verified fields backed by OCR cross-reference',
  'Low-confidence fields highlighted for quick review',
  'Missing data clearly shown, never silently dropped',
];

const mechanicPoints = [
  'No app download required for the mechanic',
  'Access expires automatically, you control the duration',
  'Read-only: mechanics can browse, never edit',
  'Built-in AI assistant helps them find what they need',
];

const faqs = [
  ['How accurate is the AI extraction from receipts?', 'Trevora works best with clear receipt photos. Every extracted field includes a confidence score so owners can quickly verify uncertain details before saving.'],
  ['What receipt formats are supported?', 'The MVP is designed around common auto shop receipts, itemized service slips, and owner-entered references. Manual entry remains available when a receipt is unclear.'],
  ['Is my vehicle data private and secure?', 'Owner workflows stay tied to the signed-in account. Mechanic access is temporary, read-only, and limited to the vehicle approved by the owner.'],
  ['Can I manage multiple vehicles?', 'Yes. Vehicle profiles keep separate service histories, record counts, costs, and mechanic access sessions.'],
  ['Does my mechanic need to install anything?', 'No. Mechanics use a shared access link or QR flow and only see approved read-only records.'],
];

const aiPaneRows = [
  [Check, 'What was done'],
  [Sparkles, 'Why it matters'],
  [TriangleAlert, 'Watch for'],
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
          <small>AI Explanation</small>
          <p>Regular oil changes prevent sludge buildup and protect your engine from long-term wear.</p>
          {aiPaneRows.map(([Icon, label]) => (
            <div key={label}>
              <Icon size={15} aria-hidden="true" />
              {label}
            </div>
          ))}
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
          <span className="fig-pill">
            <Sparkles size={15} aria-hidden="true" />
            AI-Powered Vehicle Intelligence
          </span>
          <h1>Every service.<br />Every detail.<br /><strong>Never forgotten.</strong></h1>
          <p>Trevora turns your receipts, voice memos, and manual notes into a complete, AI-verified vehicle maintenance record: searchable, shareable, and built to last.</p>
          <div className="fig-actions">
            <Link className="fig-primary fig-large" to={signedIn ? '/dashboard' : '/register'}>
              Get Started Free
              <ArrowRight size={19} aria-hidden="true" />
            </Link>
            <a className="fig-secondary fig-large" href="#workflow">See it in action</a>
          </div>
        </div>
        <AppMockup />
      </section>

      <section className="fig-trust" aria-label="Trust details">
        {trustPoints.map(([Icon, label]) => (
          <span key={label}>
            <Icon size={17} aria-hidden="true" />
            {label}
          </span>
        ))}
      </section>

      <section id="workflow" className="fig-how">
        <div className="fig-section-heading">
          <span className="fig-pill">Simple as 1-2-3</span>
          <h2>From receipt to record in under a minute</h2>
          <p>Capture right after your service visit. Trevora handles the rest automatically.</p>
        </div>
        <div className="fig-how-grid">
          {howCards.map(({ number, icon: Icon, title, text, tags }) => (
            <article className="fig-how-card" key={number}>
              <div className="fig-how-figure">
                <Icon size={30} strokeWidth={1.6} aria-hidden="true" />
                <span>{number}</span>
              </div>
              <div className="fig-how-body">
                <h3>{title}</h3>
                <p>{text}</p>
                <div>{tags.map((tag) => <small key={tag}>{tag}</small>)}</div>
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
          {featureCards.map(([Icon, title, text]) => (
            <article className="fig-feature-card" key={title}>
              <span><Icon size={22} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="fig-ai-section">
        <div className="fig-confidence-card">
          <div className="fig-confidence-head">
            <span />
            AI Extraction · receipt_may07.jpg
            <strong>Complete</strong>
          </div>
          <div className="fig-confidence-badges">
            {confidenceBadges.map(([label, count, tone]) => (
              <span className={`fig-badge-${tone}`} key={label}>{label}: {count}</span>
            ))}
          </div>
          {confidenceRows.map(([label, status, percent, tone]) => (
            <div className="fig-confidence-row" key={label}>
              <div>
                <span>{label}</span>
                <strong className={`fig-row-${tone}`}>{status}</strong>
              </div>
              <div>
                <i className={`fig-bar-${tone}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="fig-ai-copy">
          <span className="fig-pill violet">
            <Sparkles size={15} aria-hidden="true" />
            AI-powered extraction
          </span>
          <h2>You always know how confident the AI is</h2>
          <p>Every extracted field carries a live confidence rating. Trevora tells you when it is certain and flags when it needs your help.</p>
          <ul>
            {aiPoints.map((point) => (
              <li key={point}>
                <Check size={19} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="fig-mechanic">
        <div className="fig-mechanic-copy">
          <span className="fig-pill amber">
            <QrCode size={15} aria-hidden="true" />
            Instant Mechanic Access
          </span>
          <h2>Your mechanic sees exactly what they need to</h2>
          <p>Generate a time-limited QR code that gives your mechanic read-only access to your full service history. No login, no app, no friction.</p>
          <ul>
            {mechanicPoints.map((point) => (
              <li key={point}>
                <Check size={19} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <a className="fig-primary fig-large" href="#faq">
            Try mechanic view
            <ArrowRight size={19} aria-hidden="true" />
          </a>
        </div>
        <div className="fig-qr-card">
          <div className="fig-qr-head">
            <span>
              Trevora · Mechanic View
              <small>Toyota Vios 2021 · ABC 1234</small>
            </span>
            <em><Eye size={13} aria-hidden="true" /> Read-only</em>
          </div>
          <div className="fig-qr-grid" aria-hidden="true">
            {qrCells.map((on, index) => <i className={on ? 'on' : ''} key={index} />)}
          </div>
          <div className="fig-qr-foot">
            <span>
              Expires in
              <strong>1h 47m</strong>
            </span>
            <span>Records<strong>5</strong></span>
            <button type="button">Share QR</button>
          </div>
        </div>
      </section>

      <section id="faq" className="fig-faq">
        <h2>Frequently asked</h2>
        <div className="fig-faq-list">
          {faqs.map(([question, answer], index) => {
            const open = openFaq === index;
            const panelId = `fig-faq-panel-${index}`;
            return (
              <div className={`fig-faq-item ${open ? 'open' : ''}`} key={question}>
                <button
                  className="fig-faq-question"
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenFaq(open ? -1 : index)}
                >
                  {question}
                  <ChevronDown size={20} aria-hidden="true" />
                </button>
                {open && <p id={panelId}>{answer}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="fig-final-cta">
        <div>
          <h2>Start building your vehicle's permanent service record today</h2>
          <p>Free to start. No credit card required.</p>
          <Link className="fig-primary fig-large" to={signedIn ? '/dashboard' : '/register'}>
            Get Started Free
            <ArrowRight size={19} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="fig-footer">
        <div>
          <strong>Trevora</strong>
          <p>The intelligent vehicle service record companion for car owners who care about their investment.</p>
        </div>
        <div><strong>Product</strong><a href="#features">Features</a><a href="#workflow">How It Works</a><a href="#faq">FAQ</a></div>
        <div><strong>Company</strong><a href="#faq">About</a><a href="#faq">Contact</a></div>
        <div><strong>Legal</strong><a href="#faq">Privacy Policy</a><a href="#faq">Terms of Service</a><a href="#faq">Security</a></div>
      </footer>
    </main>
  );
}
