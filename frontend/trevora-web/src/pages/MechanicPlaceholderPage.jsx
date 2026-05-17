import React from 'react';
import { Link } from 'react-router-dom';

export default function MechanicPlaceholderPage() {
  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">Module 4</p>
        <h1>Mechanic access</h1>
        <p>Mechanic read-only history will appear here after owner approval is implemented.</p>
      </section>

      <section className="history-empty-state">
        <h2>Waiting for approved access</h2>
        <p>Mechanics cannot view owner service history until a vehicle owner approves a temporary access request.</p>
        <Link className="button-link" to="/login">
          Switch account
        </Link>
      </section>
    </main>
  );
}
