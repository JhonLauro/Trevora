import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Car, Clock, FileText, Gauge, KeyRound, Lock,
  MapPin, NotebookPen, ReceiptText, Store, Wallet, Wrench,
} from 'lucide-react';
import ServiceItemsList from '../components/ServiceItemsList';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import { getMechanicSessionRecord } from '../api/mechanicAccess';
import { formatAmount, formatDate, formatOdometer } from '../utils/format';
import { sourceLabel } from '../utils/recordStatus';
import { serviceItemsSummaryLabel } from '../utils/serviceText';

/**
 * One shared record, as the mechanic sees it.
 *
 * <p>This screen is the owner's record page minus the things a mechanic must
 * not have. It was built separately, on the pre-Ink `page-shell` with its own
 * `record-detail-*` and `mechanic-*` classes, and drifted: a "Service
 * snapshot" card holding a four-tile grid, the receipt demoted to a sidebar
 * beside the summary rather than above the work it explains, and every colour
 * hardcoded to the light theme.
 *
 * <p>It now renders the same structure as ServiceRecordDetailPage — the same
 * `ink-page record-page` shell, the same topbar, header, cost block and
 * two-column `record-layout`, the same `.ink-card record-card` sections and
 * the same `record-fields` rows. That is the point: a mechanic reading an
 * owner's record and the owner reading their own should be looking at one
 * screen, not two designs of it. It also means this page inherits ink-record's
 * theming for free, which is what the hardcoded colours were standing in for.
 *
 * <p>WHAT IS DELIBERATELY ABSENT
 * <ul>
 *   <li>Delete and "Share history" — the mechanic has read-only access, and a
 *       control that 403s is worse than no control.</li>
 *   <li>The AI explanation panel. It costs a model call per record on a shared
 *       budget, and the right column carries the access terms instead, which
 *       is the thing only this audience needs to see.</li>
 *   <li>The "mark as reviewed" notice, which is the owner's judgement to make.</li>
 * </ul>
 *
 * <p>The formatters come from utils/format rather than being redefined here.
 * The local copies disagreed with the owner's page — "Not provided" against
 * "Not recorded", and a different money format — so the same record read two
 * ways depending on who opened it.
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

function hasStoredReceipt(record) {
  return Boolean(
    record?.receiptStoragePath
      || record?.fieldMetadata?.storedReceiptPages?.some((page) => page?.path),
  );
}

function classificationFor(record) {
  const metadataClassification = record?.fieldMetadata?.classification;
  if (metadataClassification && typeof metadataClassification === 'object') return metadataClassification;
  if (record?.classification && typeof record.classification === 'object') return record.classification;
  return {};
}

function relatedComponentsFor(record, classification) {
  if (Array.isArray(record?.relatedComponents) && record.relatedComponents.length) return record.relatedComponents;
  if (Array.isArray(classification?.relatedComponents) && classification.relatedComponents.length) {
    return classification.relatedComponents;
  }
  return [];
}

function formatExpiry(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export default function MechanicSharedRecordDetailPage() {
  const { sessionId, recordId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getMechanicSessionRecord(sessionId, recordId)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId, recordId]);

  const record = detail?.record;
  const classification = record ? classificationFor(record) : {};
  const relatedComponents = relatedComponentsFor(record, classification);
  const category = record?.category || classification.serviceCategory || 'Service';
  const source = sourceLabel(record?.sourceInputMethod);
  const backHref = `/mechanic/access/${sessionId}`;

  return (
    <main className="ink-page record-page mechanic-shared-page tv-reveal-group">
      {/* Breadcrumb and the one action, on one row — the owner page's topbar.
          "Shared records" stands in for "Garage": it is where this mechanic
          came from and the only other place they can go. */}
      <div className="record-topbar">
        <nav className="vehicle-crumbs" aria-label="Breadcrumb">
          <Link to={backHref}>Shared records</Link>
          {record && (
            <>
              <span aria-hidden="true">/</span>
              <span>{detail.vehicleLabel}</span>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{formatDate(record.serviceDate)}</span>
            </>
          )}
        </nav>
        <div className="record-topbar__actions">
          <Link className="ink-button ink-button--outline ink-button--sm" to={backHref}>
            <ArrowLeft size={16} aria-hidden="true" />
            <span className="record-topbar__label">Back to shared records</span>
          </Link>
        </div>
      </div>

      {loading && <p className="ink-page__summary">Loading read-only record…</p>}
      {error && !loading && <BlockedAccessMessage message={error} backHref={backHref} />}

      {record && !loading && !error && (
        <>
          {/* Stated once, at the top, in a sentence. It is not a warning — a
              mechanic reading a record is the system working — so it takes a
              neutral tone rather than the amber `record-notice`. */}
          <p className="record-notice record-notice--readonly">
            <Lock size={16} aria-hidden="true" />
            Read-only. This record was shared by its owner, and nothing here can be changed.
          </p>

          <header className="record-header">
            <div>
              <h1 className="ink-page__title">{serviceItemsSummaryLabel(record.services)}</h1>
              <p className="ink-page__summary">
                {detail.vehicleLabel} · {formatDate(record.serviceDate)} · {source}
              </p>
              <div className="record-header__badges">
                <span className="ink-badge ink-badge--ok">Verified</span>
                <span className="ink-badge ink-badge--none">{category}</span>
                {relatedComponents.map((component) => (
                  <span className="ink-badge ink-badge--none" key={component}>{component}</span>
                ))}
              </div>
            </div>
            <div className="record-header__cost">
              <span className="ink-eyebrow">Total cost</span>
              <strong>
                {record.totalCost != null ? `PHP ${formatAmount(record.totalCost)}` : '—'}
              </strong>
            </div>
          </header>

          <div className="record-layout">
            <div className="record-main">
              {/* The paper first, then what was read off it, then the fields it
                  produced — the owner page's order. Here it replaces a sidebar
                  that put the receipt beside its own summary. */}
              {hasStoredReceipt(record) && (
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
                  <Field icon={Car} label="Vehicle" value={detail.vehicleLabel} />
                  <Field icon={Calendar} label="Date of service" value={formatDate(record.serviceDate)} />
                  <Field
                    icon={Gauge}
                    label="Odometer"
                    mono
                    value={record.odometer != null ? formatOdometer(record.odometer) : null}
                  />
                  <Field icon={Store} label="Shop" value={record.shopName} />
                  <Field icon={MapPin} label="Location" value={record.location} />
                  <Field
                    icon={Wallet}
                    label="Total cost"
                    mono
                    value={record.totalCost != null ? `PHP ${formatAmount(record.totalCost)}` : null}
                  />
                  <Field
                    icon={NotebookPen}
                    label="Customer / technician notes"
                    value={record.remarks}
                    absent="No notes were recorded"
                  />
                </div>
              </section>
            </div>

            {/* Where the owner's page carries the plain-language explanation,
                this carries the terms of the visit. It is the one thing on the
                screen the owner does not need and the mechanic does: how they
                got in, and when that stops. */}
            <aside className="record-side">
              <section className="ink-card record-card">
                <div className="record-card__head">
                  <h2 className="ink-section-title">
                    <KeyRound size={18} aria-hidden="true" /> Your access
                  </h2>
                </div>
                <div className="record-fields">
                  <Field icon={KeyRound} label="Permission" value={detail.permission} />
                  <Field
                    icon={Clock}
                    label="Access expires"
                    value={formatExpiry(detail.expiresAt)}
                    absent="No expiry set"
                  />
                  <Field icon={FileText} label="Recorded from" value={source} />
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

function BlockedAccessMessage({ message, backHref }) {
  return (
    <section className="ink-empty">
      <h2 className="ink-empty__title">Access unavailable</h2>
      <p className="ink-empty__body">{message}</p>
      <div className="ink-empty__actions">
        <Link className="ink-button ink-button--outline" to={backHref}>
          Back to shared records
        </Link>
      </div>
    </section>
  );
}
