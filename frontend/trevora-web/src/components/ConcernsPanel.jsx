import React, { useState } from 'react';
import { Check, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useT } from '../i18n/index.jsx';
import { noticedAgo } from '../utils/noticedAgo';
import { openConcerns, resolvedConcerns } from '../utils/concerns';

/**
 * The owner's own notes about their car.
 *
 * <p>One textarea and a button. No category, no severity, no component picker —
 * this gets written at the service counter or at eleven at night, and every
 * extra control is a reason not to bother. It is also the one place in Trevora
 * the owner states something directly rather than having it inferred from a
 * receipt, and anything that asks them to classify it starts turning it back
 * into the same kind of guess as everything else.
 *
 * <p>Resolved concerns collapse rather than disappear. A complaint that turned
 * out to be the brakes is worth finding again next time the brakes come up.
 */
export default function ConcernsPanel({
  concerns,
  onAdd,
  onEdit,
  onResolve,
  onDelete,
  busy = false,
}) {
  const t = useT();
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const open = openConcerns(concerns);
  const resolved = resolvedConcerns(concerns);

  async function submit(event) {
    event.preventDefault();
    const text = note.trim();
    if (!text) return;
    await onAdd(text);
    setNote('');
  }

  async function saveEdit(concern) {
    const text = draft.trim();
    if (!text) return;
    await onEdit(concern.concernId, text);
    setEditingId(null);
  }

  return (
    <div className="concerns">
      <form className="concerns-add" onSubmit={submit}>
        <label className="concerns-add__label" htmlFor="concern-note">
          {t('concerns.addLabel')}
        </label>
        <textarea
          id="concern-note"
          className="concerns-add__field"
          rows={2}
          value={note}
          placeholder={t('concerns.placeholder')}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="concerns-add__foot">
          {/* The hint says what this is for, not how to use it. Someone who has
              opened a textarea does not need to be told to type in it. */}
          <span className="concerns-add__hint">{t('concerns.hint')}</span>
          <button className="ink-button" type="submit" disabled={busy || !note.trim()}>
            {t('concerns.save')}
          </button>
        </div>
      </form>

      {open.length === 0 && resolved.length === 0 && (
        <p className="concerns-empty">{t('concerns.none')}</p>
      )}

      {open.length > 0 && (
        <ul className="concerns-list">
          {open.map((concern) => (
            <li className="concern" key={concern.concernId}>
              {editingId === concern.concernId ? (
                <div className="concern__edit">
                  <textarea
                    className="concerns-add__field"
                    rows={2}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <div className="concern__edit-actions">
                    <button className="ink-button" type="button" onClick={() => saveEdit(concern)}>
                      {t('concerns.save')}
                    </button>
                    <button
                      className="ink-link-button"
                      type="button"
                      onClick={() => setEditingId(null)}
                    >
                      {t('concerns.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="concern__body">
                    <p className="concern__note">{concern.note}</p>
                    <span className="concern__age">{noticedAgo(concern.createdAt)}</span>
                  </div>
                  <div className="concern__actions">
                    <button
                      className="concern__action"
                      type="button"
                      title={t('concerns.edit')}
                      aria-label={t('concerns.edit')}
                      onClick={() => {
                        setEditingId(concern.concernId);
                        setDraft(concern.note);
                      }}
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="concern__action concern__action--ok"
                      type="button"
                      title={t('concerns.resolve')}
                      aria-label={t('concerns.resolve')}
                      onClick={() => onResolve(concern.concernId, true)}
                    >
                      <Check size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="concern__action concern__action--danger"
                      type="button"
                      title={t('concerns.delete')}
                      aria-label={t('concerns.delete')}
                      onClick={() => onDelete(concern.concernId)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <section className="concerns-resolved">
          {/* Collapsed, not deleted. Closed once and kept, because the next time
              the same symptom appears the last one is the useful context. */}
          <button
            className="concerns-resolved__toggle"
            type="button"
            aria-expanded={showResolved}
            onClick={() => setShowResolved((current) => !current)}
          >
            {t('concerns.resolvedCount').replace('{count}', String(resolved.length))}
          </button>
          {showResolved && (
            <ul className="concerns-list concerns-list--resolved">
              {resolved.map((concern) => (
                <li className="concern concern--resolved" key={concern.concernId}>
                  <div className="concern__body">
                    <p className="concern__note">{concern.note}</p>
                    <span className="concern__age">{noticedAgo(concern.createdAt)}</span>
                  </div>
                  <div className="concern__actions">
                    <button
                      className="concern__action"
                      type="button"
                      title={t('concerns.reopen')}
                      aria-label={t('concerns.reopen')}
                      onClick={() => onResolve(concern.concernId, false)}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
