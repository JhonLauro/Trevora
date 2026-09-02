import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Car, Clock, FileText, Gauge, MapPin,
  ReceiptText, Share2, Store, Trash2, Wallet, Wrench,
} from 'lucide-react';
import AIExplanationPanel from '../components/AIExplanationPanel';
import ConfirmDialog, { useDeleteAction } from '../components/ink/ConfirmDialog.jsx';
import ServiceItemsList from '../components/ServiceItemsList';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import { deleteVehicleServiceRecord, getVehicleServiceRecord } from '../api/serviceHistory';
import { getVehicle } from '../api/vehicles';
import { formatAmount, formatDate, formatOdometer } from '../utils/format';
import { needsReview, recordStatusLabel, sourceLabel } from '../utils/recordStatus';
import { serviceItemsSummaryLabel } from '../utils/serviceText';
import { displayVehicleName, displayVehicleSubtitle } from '../utils/vehicleText';

/**
 * One confirmed service record, in full.
 *
 * Rewritten off the pre-Ink classes, and with three claims removed that the
 * page had no basis for making:
 *
 * - **A hardcoded "Validated" badge on every record.** The same assertion
 *   migration 009 exists to prevent, and the same one the mechanic view was
 *   making. Status now comes from `validationStatus`.
 * - **"Verified" beside the vehicle, and "Confirmed" beside every field.**
 *   Printed unconditionally, including on fields OCR guessed and nobody
 *   checked. A per-field confidence badge is only honest if it reads the
 *   per-field confidence, so rather than fake it, the record's one real
 *   status is stated once at the top.
 * - **An "AI explanation" badge** that appeared whether or not one existed.
 *
 * The letter-in-a-circle icons are gone too. They came from
 * `label.charAt(0)`, so Service Date, Shop Name and Shop Location all
 * rendered an identical "S" — three different fields wearing the same badge.
 */

/* One icon per field, none repeating. Decorative only — every row states its
   own label, so a screen reader loses nothing by skipping them.

   Each `value` returns null when there is nothing to show and Field supplies
   the wording, which is what keeps a missing reading from being dressed as a
   present one: "NOT RECORDED" set in tabular mono read with more weight than
   the odometer readings it was standing in for. */
function formatSavedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const DETAIL_FIELDS = [
  { key: 'serviceDate', label: 'Service date', icon: Calendar, value: (r) => (r.serviceDate ? formatDate(r.serviceDate) : null) },
  { key: 'odometer', label: 'Odometer', icon: Gauge, mono: true, value: (r) => (r.odometer != null ? formatOdometer(r.odometer) : null) },
  { key: 'shopName', label: 'Shop', icon: Store, value: (r) => r.shopName || null },
  { key: 'location', label: 'Location', icon: MapPin, value: (r) => r.location || null },
  { key: 'remarks', label: 'Remarks', icon: FileText, value: (r) => r.remarks || null, absent: 'None given' },
];

function serviceCategories(record) {
  return [...new Set((record?.services ?? []).map((item) => item.serviceCategory).filter(Boolean))];
}

/**
 * One labelled fact.
 *
 * A null value is a statement about the record, not a value in it, so it
 * loses the mono treatment and recedes rather than sitting at full weight
 * beside real data.
 */
function Field({ icon: Icon, label, value, mono, absent = 'Not recorded' }) {
  const missing = value == null || value === '';
  return (
    <div className="record-field">
      <span className="record-field__icon" aria-hidden="true"><Icon size={18} /></span>
      <div className="record-field__body">
        <span className="ink-eyebrow">{label}</span>
        <span className={`record-field__value${mono && !missing ? ' ink-mono' : ''}${missing ? ' is-empty' : ''}`}>
          {missing ? absent : value}
        </span>
      </div>
    </div>
  );
}

export default function ServiceRecordDetailPage() {
  const { vehicleId, recordId } = useParams();
  const navigate = useNavigate();

  /* Back to the vehicle, replacing this entry: the record it showed no
     longer exists, so leaving it in history means Back lands on a 'not
     found' page for something the user themselves just deleted. */
  const recordDelete = useDeleteAction(
    () => deleteVehicleServiceRecord(vehicleId, recordId),
    () => navigate(`/vehicles/${vehicleId}`, { replace: true }),
  );
  const [vehicle, setVehicle] = useState(null);
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      getVehicle(vehicleId),
      getVehicleServiceRecord(vehicleId, recordId),
    ])
      .then(([vehicleData, recordData]) => {
        if (!active) return;
        setVehicle(vehicleData);
        setRecord(recordData);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [vehicleId, recordId]);

  if (loading) {
    return (
      <main className="ink-page record-page">
        <p className="ink-page__summary">Loading this record…</p>
      </main>
    );
  }

  if (error || !record) {
    return (
      <main className="ink-page record-page">
        <section className="ink-empty">
          <h1 className="ink-empty__title">This record could not be opened</h1>
          <p className="ink-empty__body">{error || 'It may have been deleted.'}</p>
          <div className="ink-empty__actions">
            <Link className="ink-button ink-button--outline" to={`/vehicles/${vehicleId}`}>Back to the vehicle</Link>
          </div>
        </section>
      </main>
    );
  }

  const name = vehicle ? displayVehicleName(vehicle) : 'Vehicle';
  const unreviewed = needsReview(record);

  return (
    <main className="ink-page record-page tv-reveal-group">
      {/* Breadcrumb and actions on one row. The two buttons used to be a
          footer under everything, which put "Back to the vehicle" below a
          receipt image, an explanation and a table — an exit you had to
          scroll the whole page to reach. */}
      <div className="record-topbar">
        <nav className="vehicle-crumbs" aria-label="Breadcrumb">
          <Link to="/">Garage</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/vehicles/${vehicleId}`}>{name}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{formatDate(record.serviceDate)}</span>
        </nav>
        <div className="record-topbar__actions">
          <Link className="ink-button ink-button--outline ink-button--sm" to={`/vehicles/${vehicleId}`}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to the vehicle
          </Link>
          {/* The label is a span so a phone can drop it and leave the icon.
              `aria-label` on the link carries the name either way, so the
              control is never unnamed. */}
          <Link
            className="ink-button ink-button--outline ink-button--sm record-topbar__share"
            to={`/vehicles/${vehicleId}/share`}
            aria-label="Share history"
          >
            <Share2 size={16} aria-hidden="true" />
            <span className="record-topbar__label">Share history</span>
          </Link>
          {/* Last in the row, and the only outline-danger control on the page.
              Deleting is the one action here that cannot be undone, so it sits
              apart from the two that just move you somewhere — reachable
              without hunting, never the button nearest your thumb. */}
          <button
            className="ink-button ink-button--outline ink-button--sm ink-button--danger-outline"
            type="button"
            onClick={recordDelete.ask}
            aria-label="Delete this record"
          >
            <Trash2 size={16} aria-hidden="true" />
            <span className="record-topbar__label">Delete</span>
          </button>
        </div>
      </div>

      <header className="record-header">
        <div>
          <h1 className="ink-page__title">{serviceItemsSummaryLabel(record.services)}</h1>
          <p className="ink-page__summary">
            {name} · {formatDate(record.serviceDate)} · {sourceLabel(record.sourceInputMethod)}
          </p>
          <div className="record-header__badges">
            {/* The record's one real status, read from the column rather than
                asserted. Everything beside it is a category, not a claim. */}
            <span className={`ink-badge ink-badge--${unreviewed ? 'warn' : 'ok'}`}>
              {recordStatusLabel(record)}
            </span>
            {serviceCategories(record).map((category) => (
              <span className="ink-badge ink-badge--none" key={category}>{category}</span>
            ))}
          </div>
        </div>
        <div className="record-header__cost">
          <span className="ink-eyebrow">Total cost</span>
          <strong>PHP {formatAmount(record.totalCost)}</strong>
          {record.amountCovered > 0 && (
            <span className="record-header__covered">PHP {formatAmount(record.amountCovered)} covered</span>
          )}
        </div>
      </header>

      {unreviewed && (
        <p className="record-notice">
          Nobody has checked these fields against the receipt. They were read automatically and
          saved as-is — open the vehicle's timeline to mark this reviewed once you have.
        </p>
      )}

      <div className="record-layout">
        <div className="record-main">
          {/* The receipt sits at the top of the column it explains: the paper
              first, then what was read off it, then the fields it produced.
              It was in the side column, which put the source document beside
              its own summary rather than above it. */}
          {record.receiptStoragePath && (
            <section className="ink-card record-card">
              <div className="record-card__head">
                <h2 className="ink-section-title">
                  <ReceiptText size={18} aria-hidden="true" /> The receipt
                </h2>
              </div>
              <StoredReceiptPreview source={record} title="Stored receipt" />
            </section>
          )}

          <section className="ink-card record-card">
            <div className="record-card__head">
              <h2 className="ink-section-title">
                <Wrench size={18} aria-hidden="true" /> What was done
              </h2>
            </div>
            <ServiceItemsList services={record.services} />
          </section>

          <section className="ink-card record-card">
            <div className="record-card__head">
              <h2 className="ink-section-title">Details</h2>
            </div>

            <div className="record-fields">
              <Field
                icon={Car}
                label="Vehicle"
                /* The subtitle already carries plate, year, make and model.
                   Prefixing the name too printed "Honda Beat · ABC-123 ·
                   2021 Honda Beat" — and the heading above says the name
                   anyway, so this row is for the identifying specifics. */
                value={vehicle ? (displayVehicleSubtitle(vehicle) || name) : null}
              />
              {DETAIL_FIELDS.map((field) => (
                <Field
                  key={field.key}
                  icon={field.icon}
                  label={field.label}
                  value={field.value(record)}
                  mono={field.mono}
                />
              ))}
              <Field
                icon={Wallet}
                label="Total cost"
                mono
                value={record.totalCost != null ? `PHP ${formatAmount(record.totalCost)}` : null}
              />
              {/* The record id and the draft id that used to sit under here are
                  gone. They were already folded away, but folded away is still
                  shown — and a UUID is a diagnostic for us, not a fact about
                  somebody's car. Nothing in the product ever asks an owner for
                  one; anyone chasing a support question still has them on the
                  API response.

                  The saved date stayed and was promoted to an ordinary field.
                  When a record entered the history is a real thing to want to
                  know, and it was hidden behind the same disclosure. */}
              <Field
                icon={Clock}
                label="Saved to history"
                value={record.createdAt ? formatSavedAt(record.createdAt) : null}
              />
            </div>
          </section>
        </div>

        {/* The explanation has the right-hand column to itself now, and a
            wider one. It is the only prose on the page and it was the thing
            being squeezed. */}
        <aside className="record-side">
          <AIExplanationPanel recordId={record.recordId} />
        </aside>
      </div>

      <ConfirmDialog
        open={recordDelete.open}
        busy={recordDelete.busy}
        error={recordDelete.error}
        title="Delete this record?"
        confirmLabel="Delete record"
        onCancel={recordDelete.cancel}
        onConfirm={recordDelete.confirm}
        body={(
          <>
            <p>
              <strong>{serviceItemsSummaryLabel(record.services)}</strong>
              {record.serviceDate && <> &mdash; {formatDate(record.serviceDate)}</>}
            </p>
            <p>
              It disappears from {name}&apos;s history and from everything worked out
              from it. There is no undo.
            </p>
          </>
        )}
      />
    </main>
  );
}
