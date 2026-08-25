import React from 'react';

/**
 * The rail: status, what to look at, where it is going, and the two buttons.
 *
 * <p>This is what gives the receipt path its warnings back. They were never
 * deliberately withheld — the receipt layout was two columns of receipt and
 * fields with no room for a third, so the sidebar was simply dropped from it,
 * and with it every non-blocking warning, the duplicate notice and the whole
 * review summary. On the most common path.
 *
 * <p>There is still no third column. The rail is the second one, and the
 * receipt moved out of the layout entirely, into a page strip above the
 * fields. One layout now carries all three input methods.
 *
 * <p>Every row is a jump link to the field it names, so the count in the
 * heading always resolves to something the owner can reach. The old bar could
 * read "3 fields to check" on a screen with nothing to click.
 */
function scrollToField(id) {
  const node = document.getElementById(id);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const input = node.querySelector('input, textarea, select');
  if (input) input.focus({ preventScroll: true });
}

function RailItem({ item }) {
  return (
    <button className="flow-rail-item" type="button" onClick={() => scrollToField(item.id)}>
      <span className="flow-rail-item__name">{item.name}</span>
      <span className="flow-rail-item__why">{item.why}</span>
    </button>
  );
}

export default function StatusRail({
  ready,
  blocking = [],
  review = [],
  vehicleName,
  vehicleSubtext,
  saving,
  dirty,
  onContinue,
}) {
  const statusLine = ready
    ? 'Nothing is stopping this from being saved. Anything still flagged is yours to judge.'
    : blocking.length === 1
      ? 'One thing has to change before this can be saved. The rest is yours to judge.'
      : `${blocking.length} things have to change before this can be saved. The rest is yours to judge.`;

  return (
    <aside className="flow-check__rail">
      <section className="flow-status">
        <div>
          <p className="flow-status__eyebrow">Status</p>
          <p className="flow-status__title">{ready ? 'Ready to save' : 'Not ready to save yet'}</p>
        </div>
        <p className="flow-status__body">{statusLine}</p>
      </section>

      {(blocking.length > 0 || review.length > 0) && (
        <section className="flow-card flow-rail-list">
          {blocking.length > 0 && (
            <>
              <h2 className="flow-rail-list__head is-blocking">Has to change · {blocking.length}</h2>
              {blocking.map((item) => <RailItem key={item.id} item={item} />)}
            </>
          )}
          {review.length > 0 && (
            <>
              <h2 className="flow-rail-list__head">Worth a look · {review.length}</h2>
              {review.map((item) => <RailItem key={item.id} item={item} />)}
            </>
          )}
        </section>
      )}

      <section className="flow-card flow-saving-to">
        <p className="flow-eyebrow">Saving to</p>
        <p className="flow-saving-to__name">{vehicleName}</p>
        {vehicleSubtext && <p className="flow-note">{vehicleSubtext}</p>}
      </section>

      <div className="flow-rail-actions">
        {/* Submits the enclosing form. That form's onSubmit is the only save
            path on this screen — every field here writes through it. */}
        <button className="flow-btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {/* Confirming reads the saved draft, not this form, so unsaved edits
            would be silently left behind — the exact failure this screen was
            merged together to remove. */}
        <button
          className="flow-btn"
          type="button"
          disabled={saving || dirty || !ready}
          onClick={onContinue}
        >
          Continue to confirm
        </button>
        {dirty && (
          <p className="flow-rail-actions__hint">Save your changes first — then you can go on.</p>
        )}
        {!dirty && !ready && (
          <p className="flow-rail-actions__hint">Fix what is listed above to continue.</p>
        )}
      </div>
    </aside>
  );
}
