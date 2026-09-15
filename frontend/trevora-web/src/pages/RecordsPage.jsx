import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Search, Trash2, X } from 'lucide-react';
import { useT } from '../i18n/index.jsx';
import ConfirmDialog, { useDeleteAction } from '../components/ink/ConfirmDialog.jsx';
import FilterMenu from '../components/ink/FilterMenu.jsx';
import RecordsTable from '../components/ink/RecordsTable.jsx';
import Tabs from '../components/ink/Tabs.jsx';
import useGarage from '../hooks/useGarage.js';
import { deleteVehicleServiceRecord } from '../api/serviceHistory';
import { confirmServiceDraft, deleteServiceDraft, listServiceDrafts } from '../api/serviceDrafts';
import { formatDate, pluralize } from '../utils/format';
import { recordSearchText } from '../utils/serviceComponents';
import { serviceItemsSummaryLabel } from '../utils/serviceText';
import { displayVehicleName } from '../utils/vehicleText';

/** The vehicle filter's "no filter" value. Not `''` — an empty <select> value
    is indistinguishable from an unset one when reading the element back. */
const ALL_VEHICLES = 'all';

/**
 * Every record across every vehicle — where the dashboard's "View all {n}"
 * goes.
 *
 * Separates completed service history records and unfinished drafts into
 * dedicated accessible tabs to avoid mental model collision and keep the
 * records table clean and focused.
 */
export default function RecordsPage() {
  const t = useT();
  const { garages, allRecords, loading, error, removeRecord, refresh } = useGarage();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'drafts' ? 'drafts' : 'records';

  function handleTabChange(tabId) {
    setSearchParams(tabId === 'drafts' ? { tab: 'drafts' } : {});
  }

  const [query, setQuery] = useState('');
  const [vehicleId, setVehicleId] = useState(ALL_VEHICLES);
  const [pendingRecord, setPendingRecord] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [pendingDraft, setPendingDraft] = useState(null);

  const draftDelete = useDeleteAction(
    () => deleteServiceDraft(pendingDraft.draftId),
    () => {
      setDrafts((current) => current.filter((d) => d.draftId !== pendingDraft.draftId));
      setPendingDraft(null);
    },
  );

  const [confirmingId, setConfirmingId] = useState(null);
  const [draftError, setDraftError] = useState('');

  /*
   * One click from the list to a filed record.
   *
   * Offered only on drafts the owner has already been through -- see
   * `canValidate` below. The server decides the rest: it refuses a draft
   * missing a vehicle, date, total or service, and that refusal is shown here
   * rather than swallowed, because the fix is to open the draft.
   */
  async function markValidated(draft) {
    if (confirmingId) return;
    setConfirmingId(draft.draftId);
    setDraftError('');
    try {
      await confirmServiceDraft(draft.draftId);
      setDrafts((current) => current.filter((d) => d.draftId !== draft.draftId));
      // The confirmed record is one the garage has never loaded.
      refresh();
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setConfirmingId(null);
    }
  }

  function askDiscardDraft(draft) {
    setPendingDraft(draft);
    draftDelete.ask();
  }

  /* Drafts started and not finished. Failing quietly to none is right: this is
     a prompt, and a prompt that cannot load is better absent than wrong. */
  useEffect(() => {
    let active = true;
    listServiceDrafts()
      .then((data) => { if (active) setDrafts(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setDrafts([]); });
    return () => { active = false; };
  }, []);

  /* Each row carries its own `vehicleId`: this list spans every vehicle, so
     the page's filter value is not the record's owner and using it would
     delete against whichever car happened to be selected. */
  const recordDelete = useDeleteAction(
    () => deleteVehicleServiceRecord(pendingRecord.vehicleId, pendingRecord.recordId),
    () => {
      removeRecord(pendingRecord.recordId);
      setPendingRecord(null);
    },
  );

  function askDeleteRecord(record) {
    setPendingRecord(record);
    recordDelete.ask();
  }

  /* Every registered vehicle, not just the ones with records — a car with
     nothing filed under it is a real answer ("nothing documented yet"), and
     hiding it would make the list disagree with the Garage. Labelled with the
     same helper the table's Vehicle column uses, so the two always match.

     The second line is only drawn when it carries something. `displayVehicleSubtitle`
     falls back to "No plate recorded", which on a garage where no vehicle has a
     plate printed that phrase under every row — six lines of no information,
     each one doubling a row's height. A hint that is always the same is not a
     hint.

     Where a name repeats, the plate joins the label so the closed trigger still
     says which vehicle is filtering — but only when there is a plate to join.
     Appending "no plate" to both of two identical names distinguishes nothing
     and just makes the ambiguity longer. */
  const vehicleOptions = useMemo(() => {
    const names = garages.map(({ vehicle }) => displayVehicleName(vehicle));
    return garages.map(({ vehicle }) => {
      const name = displayVehicleName(vehicle);
      const plate = vehicle.plateNumber?.trim() || '';
      const modelLine = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
      const ambiguous = names.filter((other) => other === name).length > 1;
      return {
        vehicleId: vehicle.vehicleId,
        name: ambiguous && plate ? `${name} · ${plate}` : name,
        // Null, not a placeholder — FilterMenu omits the line entirely.
        hint: [plate, modelLine === name ? null : modelLine].filter(Boolean).join(' · ') || null,
      };
    });
  }, [garages]);

  const selectedVehicle = vehicleOptions.find((option) => option.vehicleId === vehicleId) ?? null;
  const isFiltered = vehicleId !== ALL_VEHICLES || query.trim() !== '';

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allRecords.filter((record) => {
      if (vehicleId !== ALL_VEHICLES && record.vehicleId !== vehicleId) return false;
      if (!needle) return true;
      return [
        record.vehicleName,
        serviceItemsSummaryLabel(record.services),
        recordSearchText(record),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [allRecords, query, vehicleId]);

  /* A draft earns the word only if confirming it will actually be filed as
     validated: manual entry, or one the owner has opened and corrected. */
  const canValidate = (draft) => draft.inputMethod === 'MANUAL'
    || draft.status === 'READY_FOR_REVIEW';

  /* Follows the vehicle filter so the page reads as one thing, but not the
     search box: a draft is half-entered by definition, so searching it by
     content would hide the ones with the least in them -- exactly the ones
     most in need of finishing. */
  const visibleDrafts = useMemo(
    () => (vehicleId === ALL_VEHICLES
      ? drafts
      : drafts.filter((draft) => draft.vehicleId === vehicleId)),
    [drafts, vehicleId],
  );

  const vehicleNameFor = useMemo(() => {
    const byId = new Map(vehicleOptions.map((option) => [option.vehicleId, option.name]));
    return (id) => byId.get(id) ?? 'your vehicle';
  }, [vehicleOptions]);

  const tabs = useMemo(() => [
    {
      id: 'records',
      label: t('records.tabAll'),
      count: allRecords.length,
    },
    {
      id: 'drafts',
      label: t('records.tabDrafts'),
      count: drafts.length,
    },
  ], [allRecords.length, drafts.length, t]);

  /* The old line reported the unfiltered total while the table showed a
     filtered subset, so searching left "3 records" above a single row. */
  function summaryText() {
    if (loading) return 'Loading your records…';
    if (activeTab === 'drafts') {
      if (drafts.length === 0) return t('drafts.emptyTitle');
      if (vehicleId !== ALL_VEHICLES && selectedVehicle) {
        return `Showing ${visibleDrafts.length} of ${pluralize(drafts.length, 'draft')} · ${selectedVehicle.name}`;
      }
      return `${pluralize(drafts.length, 'draft')} waiting to be finished and confirmed`;
    }
    if (!isFiltered) return `${pluralize(allRecords.length, 'record')} across your vehicles`;
    const scope = selectedVehicle ? ` · ${selectedVehicle.name}` : '';
    return `Showing ${filtered.length} of ${pluralize(allRecords.length, 'record')}${scope}`;
  }

  function emptyTitle() {
    if (allRecords.length === 0) return 'No records yet';
    if (selectedVehicle && !query.trim()) return `No records for ${selectedVehicle.name}`;
    return 'Nothing matches that search';
  }

  function emptyBody() {
    if (allRecords.length === 0) {
      return 'Upload a receipt, speak a note, or type a service in — whichever is quickest right now.';
    }
    if (selectedVehicle && !query.trim()) {
      return 'Nothing has been documented for this vehicle yet. Add its first service record, or switch back to all vehicles.';
    }
    return 'Try a shop name, a part, or the kind of service you are looking for.';
  }

  return (
    <main className="ink-page records-page">
      <header className="ink-page__header">
        <div>
          <h1 className="ink-page__title">{t('records.title')}</h1>
          <p className="ink-page__summary">{summaryText()}</p>
        </div>
        <Link className="ink-button" to="/service-input">{t('action.addRecord')}</Link>
      </header>

      {error && <div className="ink-alert">{error}</div>}

      <div className="records-tabs-container tv-reveal">
        <Tabs
          tabs={tabs}
          activeId={activeTab}
          onChange={handleTabChange}
          label="Records sections"
        />
      </div>

      {activeTab === 'records' && (
        <div id="panel-records" role="tabpanel" aria-labelledby="tab-records" tabIndex={-1}>
          {drafts.length > 0 && (
            <div className="records-draft-notice tv-reveal" style={{ '--reveal-index': 1 }}>
              <div className="records-draft-notice__message">
                <span className="records-draft-notice__badge">{drafts.length}</span>
                <span>
                  {drafts.length === 1
                    ? 'You have 1 unfinished draft waiting to be completed.'
                    : `You have ${drafts.length} unfinished drafts waiting to be completed.`}
                </span>
              </div>
              <button
                type="button"
                className="records-draft-notice__btn"
                onClick={() => handleTabChange('drafts')}
              >
                <span>{t('records.reviewDrafts')}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="records-toolbar tv-reveal" style={{ '--reveal-index': drafts.length > 0 ? 2 : 1 }}>
            <div className="records-toolbar__search">
              <Search size={17} className="records-toolbar__search-icon" aria-hidden="true" />
              <input
                type="search"
                value={query}
                aria-label={t('records.searchPlaceholder')}
                placeholder={t('records.searchPlaceholder')}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="records-toolbar__clear"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
            {vehicleOptions.length > 1 && (
              <FilterMenu
                className="records-toolbar__filter"
                label={t('records.filterByVehicle')}
                value={vehicleId}
                onChange={setVehicleId}
                options={[
                  { value: ALL_VEHICLES, label: 'All vehicles' },
                  ...vehicleOptions.map((option) => ({
                    value: option.vehicleId,
                    label: option.name,
                    hint: option.hint,
                  })),
                ]}
              />
            )}
          </div>

          {loading ? null : filtered.length === 0 ? (
            <section className="ink-empty tv-reveal" style={{ '--reveal-index': 2 }}>
              <h2 className="ink-empty__title">{emptyTitle()}</h2>
              <p className="ink-empty__body">{emptyBody()}</p>
              {allRecords.length === 0 && (
                <div className="ink-empty__actions">
                  <Link className="ink-button" to="/service-input">Add service record</Link>
                </div>
              )}
            </section>
          ) : (
            <section className="ink-table-card tv-reveal" style={{ '--reveal-index': 2 }}>
              <RecordsTable
                records={filtered}
                ariaLabel="All service records across your vehicles"
                onDelete={askDeleteRecord}
              />
            </section>
          )}
        </div>
      )}

      {activeTab === 'drafts' && (
        <div id="panel-drafts" role="tabpanel" aria-labelledby="tab-drafts" tabIndex={-1}>
          <div className="drafts-tab tv-reveal" style={{ '--reveal-index': 1 }}>
            <div className="drafts-tab__header">
              <p className="drafts-tab__note">{t('drafts.note')}</p>
              {vehicleOptions.length > 1 && (
                <FilterMenu
                  className="records-toolbar__filter"
                  label={t('records.filterByVehicle')}
                  value={vehicleId}
                  onChange={setVehicleId}
                  options={[
                    { value: ALL_VEHICLES, label: 'All vehicles' },
                    ...vehicleOptions.map((option) => ({
                      value: option.vehicleId,
                      label: option.name,
                      hint: option.hint,
                    })),
                  ]}
                />
              )}
            </div>

            {draftError && (
              <div className="ink-alert" role="alert">{draftError}</div>
            )}

            {visibleDrafts.length === 0 ? (
              <section className="ink-empty">
                <h2 className="ink-empty__title">
                  {drafts.length === 0 ? t('drafts.emptyTitle') : `No drafts for ${selectedVehicle?.name}`}
                </h2>
                <p className="ink-empty__body">
                  {drafts.length === 0
                    ? t('drafts.emptyBody')
                    : 'Try switching back to all vehicles to see your drafts.'}
                </p>
                <div className="ink-empty__actions">
                  {drafts.length === 0 ? (
                    <button
                      type="button"
                      className="ink-button"
                      onClick={() => handleTabChange('records')}
                    >
                      {t('records.viewAllRecords')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ink-button"
                      onClick={() => setVehicleId(ALL_VEHICLES)}
                    >
                      Show all vehicles
                    </button>
                  )}
                </div>
              </section>
            ) : (
              <ul className="drafts-tab__list">
                {visibleDrafts.map((draft) => (
                  <li className="draft-card" key={draft.draftId}>
                    <div className="draft-card__main">
                      <div className="draft-card__title-row">
                        <h3 className="draft-card__title">
                          {draft.shopName?.trim() || 'Service receipt / shop not named'}
                        </h3>
                        <span className={`draft-card__badge${canValidate(draft) ? ' draft-card__badge--ready' : ''}`}>
                          {draft.status === 'READY_FOR_REVIEW'
                            ? 'Ready for review'
                            : draft.inputMethod === 'RECEIPT'
                            ? 'Receipt scan'
                            : draft.inputMethod === 'VOICE'
                            ? 'Voice note'
                            : 'Manual draft'}
                        </span>
                      </div>
                      <div className="draft-card__meta">
                        <span className="draft-card__vehicle">{vehicleNameFor(draft.vehicleId)}</span>
                        <span>·</span>
                        <span className="draft-card__date">
                          {draft.serviceDate ? formatDate(draft.serviceDate) : 'No date recorded'}
                        </span>
                        {draft.totalCost != null && (
                          <>
                            <span>·</span>
                            <span className="draft-card__cost">PHP {Number(draft.totalCost).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="draft-card__actions icon-actions">
                      <button
                        aria-label={t('action.discard')}
                        className="icon-action icon-action--danger"
                        onClick={() => askDiscardDraft(draft)}
                        title={t('action.discard')}
                        type="button"
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                      {canValidate(draft) && (
                        <button
                          aria-label={t('drafts.markValidated')}
                          className="icon-action"
                          disabled={confirmingId === draft.draftId}
                          onClick={() => markValidated(draft)}
                          title={t('drafts.markValidated')}
                          type="button"
                        >
                          <BadgeCheck size={17} aria-hidden="true" />
                        </button>
                      )}
                      <Link
                        className="draft-card__finish-btn"
                        to={`/service-drafts/${draft.draftId}`}
                        title={t('action.finish')}
                      >
                        <span>{t('action.finish')}</span>
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Wording deliberately unlike the record one. Discarding a draft throws
          away work that was never in the history, so the warning should not
          borrow the weight of deleting a confirmed record -- but it is still
          gone for good, and says so. */}
      <ConfirmDialog
        open={draftDelete.open}
        busy={draftDelete.busy}
        error={draftDelete.error}
        title={t('drafts.discardAsk')}
        confirmLabel={t('drafts.discardConfirm')}
        body="It has not been added to your history, so nothing there changes. The draft itself cannot be recovered."
        onCancel={() => { draftDelete.cancel(); setPendingDraft(null); }}
        onConfirm={draftDelete.confirm}
      />

      <ConfirmDialog
        open={recordDelete.open}
        busy={recordDelete.busy}
        error={recordDelete.error}
        title={t('records.deleteRecordAsk')}
        confirmLabel={t('records.deleteRecord')}
        onCancel={() => { recordDelete.cancel(); setPendingRecord(null); }}
        onConfirm={recordDelete.confirm}
        body={pendingRecord && (
          <>
            <p>
              <strong>{serviceItemsSummaryLabel(pendingRecord.services)}</strong>
              {pendingRecord.serviceDate && <> &mdash; {formatDate(pendingRecord.serviceDate)}</>}
            </p>
            {/* Named here and not on the vehicle page's copy of this dialog:
                this list spans every car, so "your history" is not specific
                enough to catch deleting the right service off the wrong one. */}
            {pendingRecord.vehicleName && <p>On {pendingRecord.vehicleName}.</p>}
            <p>
              It disappears from that vehicle&apos;s history and from everything worked out
              from it. There is no undo.
            </p>
          </>
        )}
      />
    </main>
  );
}
