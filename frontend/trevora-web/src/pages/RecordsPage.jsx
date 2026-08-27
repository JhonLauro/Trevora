import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import FilterMenu from '../components/ink/FilterMenu.jsx';
import RecordsTable from '../components/ink/RecordsTable.jsx';
import useGarage from '../hooks/useGarage.js';
import { pluralize } from '../utils/format';
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
  const { garages, allRecords, loading, error } = useGarage();
  const [query, setQuery] = useState('');
  const [vehicleId, setVehicleId] = useState(ALL_VEHICLES);

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
          <h1 className="ink-page__title">Records</h1>
          <p className="ink-page__summary">{summaryText()}</p>
        </div>
        <Link className="ink-button" to="/service-input">Add service record</Link>
      </header>

      {error && <div className="ink-alert">{error}</div>}

      {/* Toolbar first, then whatever it is filtering. The reveal sits on
          the container, not the rows -- rows re-render on every keystroke
          in the search box. */}
      <div className="records-toolbar tv-reveal">
        <input
          type="search"
          value={query}
          aria-label="Search records"
          placeholder="Search service, part, shop, or notes"
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
          <RecordsTable records={filtered} ariaLabel="All service records across your vehicles" />
        </section>
      )}
    </main>
  );
}
