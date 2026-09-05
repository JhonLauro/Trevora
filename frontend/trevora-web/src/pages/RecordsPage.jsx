import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import ConfirmDialog, { useDeleteAction } from '../components/ink/ConfirmDialog.jsx';
import FilterMenu from '../components/ink/FilterMenu.jsx';
import RecordsTable from '../components/ink/RecordsTable.jsx';
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
 * Deliberately plain: this screen has not had its own design slice yet, so it
 * reuses the dashboard's table wholesale rather than inventing a layout that
 * would only be thrown away.
 */
export default function RecordsPage() {
  const t = useT();
  const { garages, allRecords, loading, error, removeRecord, refresh } = useGarage();
  const [query, setQuery] = useState('');
  const [vehicleId, setVehicleId] = useState(ALL_VEHICLES);
  const [pendingRecord, setPendingRecord] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [pendingDraft, setPendingDraft] = useState(null);

  /* Remembered, because the answer to "I do not want to look at this" is not
     "ask me again on every visit". The heading stays either way, so nothing is
     truly hidden -- collapsed still reads "Not finished yet · 12". */
  const [draftsOpen, setDraftsOpen] = useState(() => {
    try {
      return window.localStorage.getItem('trevora.draftsCollapsed') !== '1';
    } catch {
      // Private windows and blocked site data throw on access.
      return true;
    }
  });

  function toggleDrafts() {
    setDraftsOpen((open) => {
      try {
        window.localStorage.setItem('trevora.draftsCollapsed', open ? '1' : '0');
      } catch { /* see above */ }
      return !open;
    });
  }

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

  /* The old line reported the unfiltered total while the table showed a
     filtered subset, so searching left "3 records" above a single row. */
  function summaryText() {
    if (loading) return 'Loading your records…';
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

      {/* Toolbar first, then whatever it is filtering. The reveal sits on
          the container, not the rows -- rows re-render on every keystroke
          in the search box. */}
      <div className="records-toolbar tv-reveal">
        <input
          type="search"
          value={query}
          aria-label={t('records.searchPlaceholder')}
          placeholder={t('records.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {/* One vehicle means nothing to choose between, and a dropdown whose
            only real option is the car you are already looking at is noise. */}
        {vehicleOptions.length > 1 && (
          <FilterMenu
            className="records-toolbar__filter"
            label="Filter records by vehicle"
            value={vehicleId}
            onChange={setVehicleId}
            options={[
              /* No count here — it is already in the summary directly above,
                 and a hint on this row alone would make it the only two-line
                 row in an otherwise even list. */
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

      {/* Nothing below the toolbar until the records are actually in hand.

          This used to render the table card straight away, empty, because the
          `!loading` test only guarded the *empty state* branch -- so the card
          mounted at first paint, ran its arrival animation against nothing,
          and the rows appeared later in an element that had finished moving
          half a second earlier. The header already says "Loading your
          records…", so there is nothing lost by holding this back and
          everything gained: the block now mounts when the data lands, which is
          the moment the animation is for. */}
      {/*
        * Unfinished drafts, above the history and deliberately not in it.
        *
        * They are listed here because this is where people come looking for a
        * record they entered -- "Save and finish later" saved it and nothing
        * showed it again. But a draft is not history: it is unvalidated, its
        * total may be half-read, and the project rule that drafts are never
        * displayed as service history exists because one folded into the table
        * would count toward spend, stretch the years covered, and reach
        * mechanics through the shared view. So it sits in its own block, with
        * its own heading, and never enters `filtered`.
        */}
      {visibleDrafts.length > 0 && (
        <section className="draft-strip tv-reveal" style={{ '--reveal-index': 1 }}>
          <div className="draft-strip__head">
            <div className="draft-strip__heading">
              <h2 className="draft-strip__title">
                {t('drafts.heading')} <span className="draft-strip__count">{visibleDrafts.length}</span>
              </h2>
              <button
                className="draft-strip__toggle"
                type="button"
                aria-expanded={draftsOpen}
                aria-controls="draft-strip-list"
                onClick={toggleDrafts}
              >
                {draftsOpen ? t('action.hide') : t('action.show')}
              </button>
            </div>
            {draftError && (
              <p className="draft-strip__error" role="alert">{draftError}</p>
            )}
            {draftsOpen && (
              <p className="draft-strip__note">
                {t('drafts.note')}
              </p>
            )}
          </div>
          <ul className="draft-strip__list" id="draft-strip-list" hidden={!draftsOpen}>
            {visibleDrafts.map((draft) => (
              <li className="draft-strip__row" key={draft.draftId}>
                <div className="draft-strip__facts">
                  <span className="draft-strip__vehicle">{vehicleNameFor(draft.vehicleId)}</span>
                  <span className="draft-strip__meta">
                    {[
                      draft.serviceDate ? formatDate(draft.serviceDate) : 'No date yet',
                      draft.shopName?.trim() || 'No shop yet',
                    ].join(' · ')}
                  </span>
                </div>
                <div className="draft-strip__actions">
                  {/* Without this the list only ever grows: a draft nobody
                      intends to finish has no other way out, and the block
                      that was meant to help ends up burying the records. */}
                  <button
                    className="ink-link-button ink-link-button--danger"
                    type="button"
                    onClick={() => askDiscardDraft(draft)}
                  >
                    {t('action.discard')}
                  </button>
                  {/* Only where the word is true.
                      ServiceRecordService.validationStatusFor grants VALIDATED
                      to manual entry and to drafts the owner opened and
                      corrected (READY_FOR_REVIEW). A receipt confirmed straight
                      off the extraction is filed NEEDS_REVIEW no matter which
                      button did it -- so offering "Mark as validated" on one
                      would promise a status the server will not give, and the
                      record would come back still asking to be reviewed. Those
                      drafts get Finish, which is the review this is missing. */}
                  {canValidate(draft) && (
                    <button
                      className="ink-link-button"
                      type="button"
                      disabled={confirmingId === draft.draftId}
                      onClick={() => markValidated(draft)}
                    >
                      {confirmingId === draft.draftId ? 'Saving…' : t('drafts.markValidated')}
                    </button>
                  )}
                  <Link className="ink-button ink-button--outline" to={`/service-drafts/${draft.draftId}`}>
                    {t('action.finish')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? null : filtered.length === 0 ? (
        <section className="ink-empty tv-reveal" style={{ '--reveal-index': 1 }}>
          <h2 className="ink-empty__title">{emptyTitle()}</h2>
          <p className="ink-empty__body">{emptyBody()}</p>
          {allRecords.length === 0 && (
            <div className="ink-empty__actions">
              <Link className="ink-button" to="/service-input">Add service record</Link>
            </div>
          )}
        </section>
      ) : (
        <section className="ink-table-card tv-reveal" style={{ '--reveal-index': 1 }}>
          <RecordsTable
            records={filtered}
            ariaLabel="All service records across your vehicles"
            onDelete={askDeleteRecord}
          />
        </section>
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
