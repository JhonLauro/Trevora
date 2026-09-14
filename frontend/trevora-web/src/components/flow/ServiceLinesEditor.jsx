import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { translate as t } from '../../i18n/index.jsx';
import { Check, X } from 'lucide-react';
import { serviceNameSuggestions } from '../../data/serviceNames';
import {
  DEFAULT_LINE_KIND,
  LINE_KINDS,
  formatPeso,
  lineEntriesOf,
  pesosFromCentavos,
  amountsCheck,
} from '../../utils/serviceLines';

/**
 * "What was done", flattened to two levels.
 *
 * <p>The old editor nested five deep — block, service row, lines editor, per
 * line a kind select, plus a disclosure for the legacy free-text fields — all
 * inside the dense half of a two-column layout, on what is very often a phone.
 *
 * <p>Here a service is one row and its receipt lines are a flat table under
 * it. The kind is a column, not another box. Same component on the typing
 * screen and the checking screen, so an owner learns it once.
 *
 * <p>The pre-011 {@code partsReplaced} / {@code laborPerformed} buckets are
 * still written and still round-trip — classification and component evidence
 * read them — they are simply no longer surfaced. Nothing offers to create
 * new ones, and nothing drops the ones that exist.
 */

/**
 * The service name, with suggestions under it.
 *
 * <p>Not a closed list and not shaped like one: a plain field that offers
 * help, rather than a picker with a chevron promising a set of answers. A
 * receipt says whatever the shop chose to print, and this field has to take
 * it. Typing something no suggestion matches is the ordinary case, not an
 * error -- there is no warning and nothing changes colour.
 *
 * <p>It fills `serviceType` and nothing else. Mapping a name to a category
 * here would be a second definition of category assignment competing with the
 * backend classifier; see `data/serviceNames.js`.
 */
function ServiceNameField({ services, index, value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef(null);

  const matches = open ? serviceNameSuggestions(services, index, value) : [];

  useEffect(() => {
    function onPointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function choose(name) {
    onChange(name);
    setOpen(false);
    setHighlight(-1);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setHighlight(-1);
      return;
    }
    if (matches.length === 0) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => {
        const next = current + step;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
    } else if (event.key === 'Enter' && highlight >= 0) {
      /* Only when a suggestion is highlighted. Enter on freely typed text must
         submit the form the way it always did, not be swallowed by a list the
         owner was ignoring. */
      event.preventDefault();
      choose(matches[highlight]);
    }
  }

  return (
    <div className="flow-service__name-field" ref={wrapperRef}>
      <input
        className="flow-input flow-service__name"
        value={value ?? ''}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Oil change, brake repair, body and paint"
        aria-label={label}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="flow-suggest" role="listbox" aria-label="Common service names">
          {matches.map((name, position) => (
            <li
              key={name}
              role="option"
              aria-selected={position === highlight}
              className={`flow-suggest__item${position === highlight ? ' is-highlighted' : ''}`}
              onMouseEnter={() => setHighlight(position)}
              onMouseDown={(event) => { event.preventDefault(); choose(name); }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function emptyLine() {
  return {
    entryId: null,
    kind: DEFAULT_LINE_KIND,
    description: '',
    partCode: '',
    quantity: '',
    unitPrice: '',
    lineTotal: '',
  };
}

function emptyService(sortOrder = 0) {
  return {
    itemId: null,
    serviceType: '',
    serviceCategory: '',
    partsReplaced: '',
    laborPerformed: '',
    lineCost: '',
    lineEntries: [],
    sortOrder,
  };
}

/**
 * The receipt checked against itself.
 *
 * <p>Reports the gap and never corrects either side: which of the two figures
 * was misread is a question only the person holding the paper can answer.
 * Recomputed from the form on every keystroke, so it closes as you fix it.
 *
 * <p><b>Numbers with honest labels, not sentences explaining numbers.</b> A
 * receipt that checks out gets one row. The table appears only when something
 * needs looking at, and its rows carry what the sentences used to say: which
 * figure, the receipt's value, the lines' value, and the difference. Text
 * appears in proportion to what is wrong. Owners in validation called this
 * screen text-heavy before the parts and labour check added three rows of
 * labels and three sentences to it.
 */
export function Balance({ services, totalCost, printed, amountCovered }) {
  const t = useT();
  const check = amountsCheck(services, totalCost, printed, amountCovered);
  if (check.verdict === 'no-lines') return null;

  if (check.verdict === 'verified' || check.verdict === 'sum-only' || check.verdict === 'match') {
    const verified = check.verdict === 'verified';
    /* The label says amounts, not "the receipt": this checks the total and the
       printed parts and labour figures and nothing else. Descriptions, part
       codes and two part prices swapped with each other are not checked. */
    return (
      <>
        <div className={`flow-balance flow-balance--row${verified ? ' is-verified' : ''}`}>
          {verified && <Check className="flow-balance__icon" aria-hidden="true" />}
          <span>{verified ? t('lines.matchesReceipt') : t('lines.onlyTotalChecked')}</span>
          <span className="flow-balance__value">{centavosAsPeso(check.printedTotal)}</span>
        </div>
        {check.unpricedCount > 0 && <p className="flow-note">{unpricedNote(check.unpricedCount)}</p>}
      </>
    );
  }

  const message = messageFor(check);
  return (
    <>
      <table className="flow-balance-table">
        <thead>
          <tr>
            <td />
            {/* The currency once per column, not on every figure: a casa bill in the
                thousands wrapped "PHP" onto its own line in each cell on a phone. */}
            <th scope="col">{t('lines.receiptColumn')} (PHP)</th>
            <th scope="col">{t('lines.yourLines')} (PHP)</th>
          </tr>
        </thead>
        <tbody>
          {check.verdict === 'split-mismatch' && (
            <>
              {/* Parts includes Supplies lines: receipts print consumables under parts. */}
              <FigureRow label={t('lines.partsRow')} figures={check.parts} />
              <FigureRow label={t('lines.labourRow')} figures={check.labour} />
            </>
          )}
          <FigureRow
            label={check.againstCharges ? t('lines.itemsTotal') : t('lines.receiptTotal')}
            figures={{ printed: check.printedTotal, lines: check.lineSum, off: check.state === 'gap' }}
            total={check.verdict === 'split-mismatch'}
          />
        </tbody>
      </table>
      {message && <p className="flow-note">{message}</p>}
    </>
  );
}

function centavosAsPeso(centavos) {
  return formatPeso(pesosFromCentavos(centavos));
}

/** A table figure without its currency, which the column heading carries. */
function centavosAsAmount(centavos) {
  return pesosFromCentavos(centavos).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** One figure: its name, what the receipt prints, and what the lines add up to. */
function FigureRow({ label, figures, total = false }) {
  const t = useT();
  return (
    <tr className={total ? 'flow-balance-table__total' : undefined}>
      <th scope="row">{label}</th>
      <td>{figures.printed === null ? t('lines.notFilled') : centavosAsAmount(figures.printed)}</td>
      <td className={figures.off ? 'is-gap' : undefined}>{centavosAsAmount(figures.lines)}</td>
    </tr>
  );
}

function unpricedNote(count) {
  return count === 1 ? t('lines.unpricedOne') : t('lines.unpricedOther', { count });
}

/** The one sentence the table cannot say, or '' when it says everything. */
function messageFor(check) {
  switch (check.verdict) {
    case 'split-mismatch': {
      const cause = wrongLinesCause(check);
      return check.sourcesDisagree ? `${cause} ${t('lines.sourcesDisagree')}` : cause;
    }
    case 'gap': {
      const unchecked = uncheckedSentence(check);
      return unchecked ? `${t('lines.leaveGap')} ${unchecked}` : t('lines.leaveGap');
    }
    case 'split-unreadable':
      return t('lines.splitUnreadable');
    case 'no-total':
      return t('lines.fillTotal');
    case 'no-prices':
      return `${t('lines.noneHaveAmount')} ${t('lines.addAmounts')}`;
    default:
      return '';
  }
}

/**
 * Verdict 1 in one sentence, naming the cause the figures can prove.
 *
 * <p>A missing amount can only leave a figure short, never over. So when a line
 * is unpriced, verdict 1 fired on an over-run: something really is on the wrong
 * line, and there is also an amount to fill in (the live Palmetto run: labour's
 * 134.27 on CVT FLUID ENHANCER, and PERFORM empty). With every line priced and
 * the items total matching the receipt, amounts only moved between lines. With
 * every line priced and the total off too, an amount may be misread rather than
 * misplaced, and "wrong lines" would claim more than the figures show.
 */
function wrongLinesCause(check) {
  if (check.unpricedCount === 1) return t('lines.wrongLinesUnpricedOne');
  if (check.unpricedCount > 1) return t('lines.wrongLinesUnpricedOther', { count: check.unpricedCount });
  return check.state === 'gap' ? t('lines.amountsDontMatch') : t('lines.wrongLines');
}

/** What the gap message has to add when parts and labour were not checked. */
function uncheckedSentence(check) {
  if (check.unchecked === 'unreadable') return t('lines.gapUncheckedUnreadable');
  if (check.unchecked !== 'unpriced') return '';
  return check.unpricedCount === 1
    ? t('lines.gapUncheckedUnpricedOne')
    : t('lines.gapUncheckedUnpricedOther', { count: check.unpricedCount });
}

/** The check as one sentence for the rail, or null when there is nothing to say. */
export function balanceWarning(services, totalCost, printed, amountCovered) {
  const check = amountsCheck(services, totalCost, printed, amountCovered);
  if (check.verdict === 'split-mismatch') return t('lines.railSplitMismatch');
  if (check.verdict === 'split-unreadable') return t('lines.railSplitUnreadable');
  if (check.verdict !== 'gap' || check.gap === null) return null;
  const gap = formatPeso(Math.abs(pesosFromCentavos(check.gap)));
  if (check.againstCharges) {
    return check.gap > 0 ? t('lines.railOverCharges', { gap }) : t('lines.railShortCharges', { gap });
  }
  return check.gap > 0 ? t('lines.railOverTotal', { gap }) : t('lines.railShortTotal', { gap });
}

export default function ServiceLinesEditor({ value, onChange, id }) {
  const t = useT();
  const services = Array.isArray(value) && value.length > 0 ? value : [emptyService(0)];

  function updateService(index, patch) {
    onChange(services.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addService() {
    onChange([...services, emptyService(services.length)]);
  }

  function removeService(index) {
    const next = services
      .filter((_, i) => i !== index)
      .map((row, i) => ({ ...row, sortOrder: i }));
    onChange(next.length ? next : [emptyService(0)]);
  }

  function updateLine(serviceIndex, lineIndex, patch) {
    const lines = lineEntriesOf(services[serviceIndex]);
    updateService(serviceIndex, {
      lineEntries: lines.map((line, i) => (i === lineIndex ? { ...line, ...patch } : line)),
    });
  }

  function addLine(serviceIndex) {
    updateService(serviceIndex, {
      lineEntries: [...lineEntriesOf(services[serviceIndex]), emptyLine()],
    });
  }

  function removeLine(serviceIndex, lineIndex) {
    updateService(serviceIndex, {
      lineEntries: lineEntriesOf(services[serviceIndex]).filter((_, i) => i !== lineIndex),
    });
  }

  return (
    <div id={id} className="flow-rail-target">
      {services.map((service, serviceIndex) => {
        const lines = lineEntriesOf(service);
        return (
          <div className="flow-service" key={service.itemId ?? `new-service-${serviceIndex}`}>
            <div className="flow-service__row">
              <ServiceNameField
                services={services}
                index={serviceIndex}
                value={service.serviceType}
                onChange={(name) => updateService(serviceIndex, { serviceType: name })}
                label={`Service ${serviceIndex + 1}`}
              />
              <input
                className="flow-input flow-service__subtotal"
                type="number"
                min="0"
                step="0.01"
                value={service.lineCost ?? ''}
                onChange={(event) => updateService(serviceIndex, { lineCost: event.target.value })}
                placeholder={t('lines.subtotal')}
                aria-label={`Subtotal for service ${serviceIndex + 1}`}
              />
              {services.length > 1 && (
                <button
                  className="flow-x"
                  type="button"
                  onClick={() => removeService(serviceIndex)}
                  aria-label={`Remove service ${serviceIndex + 1}`}
                >
                  <X size={19} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Without lines a record is a total and nothing about what it
                paid for, which is worth saying at the moment it is true
                rather than discovering later on the history screen. */}
            {lines.length === 0 && (
              <div className="flow-lines-empty">
                <strong>{t('lines.noItemised')}</strong>
                <span>
                  Add them to record what each charge was for. Without them, this record
                  shows a total and nothing about what it bought.
                </span>
              </div>
            )}

            {lines.length > 0 && (
              <div className="flow-lines">
                <span className="flow-lines__h">{t('lines.onReceipt')}</span>
                <span className="flow-lines__h">{t('lines.kind')}</span>
                <span className="flow-lines__h flow-lines__h--right">{t('lines.amount')}</span>
                {/* The header cell above the delete column. It carries the
                    header class despite having no text so that it hides with
                    the other three on a narrow screen — bare, it stayed behind
                    as an empty grid cell and pushed the first line down a
                    row. */}
                <span className="flow-lines__h" />
                {lines.map((line, lineIndex) => (
                  <React.Fragment key={line.entryId ?? `new-line-${lineIndex}`}>
                    <div className="flow-lines__desc">
                      {/* The column headers are hidden on a phone -- three
                          labels across the top cannot survive the stacked
                          layout -- which left this field with nothing naming
                          it. The select says "Part" and the amount carries a
                          currency, so those two explain themselves; the
                          description was the one that did not. Shown only
                          where the header is gone. */}
                      <span className="flow-lines__label">{t('lines.onReceipt')}</span>
                      <input
                        value={line.description ?? ''}
                        title={line.description || undefined}
                        onChange={(event) => updateLine(serviceIndex, lineIndex, { description: event.target.value })}
                        placeholder={t('lines.asPrinted')}
                        aria-label={`Line ${lineIndex + 1} description`}
                      />
                      {/* Read off the receipt, not editable: it is evidence,
                          and a part number nobody typed is one nobody can
                          mistype. */}
                      {line.partCode ? <span className="flow-lines__code">{line.partCode}</span> : null}
                    </div>
                    <select
                      value={line.kind ?? DEFAULT_LINE_KIND}
                      onChange={(event) => updateLine(serviceIndex, lineIndex, { kind: event.target.value })}
                      aria-label={`Line ${lineIndex + 1} kind`}
                    >
                      {LINE_KINDS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      className="flow-money"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.lineTotal ?? ''}
                      onChange={(event) => updateLine(serviceIndex, lineIndex, { lineTotal: event.target.value })}
                      placeholder="0.00"
                      aria-label={`Line ${lineIndex + 1} amount`}
                    />
                    <button
                      className="flow-x"
                      type="button"
                      onClick={() => removeLine(serviceIndex, lineIndex)}
                      aria-label={`Remove line ${lineIndex + 1}`}
                    >
                      <X size={19} aria-hidden="true" />
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

            <button className="flow-link" type="button" onClick={() => addLine(serviceIndex)}>
              {t('lines.addLine')}
            </button>
          </div>
        );
      })}

      <div className="flow-done__foot">
        {/* Quieter than "Add a line" on purpose. In scan mode the OCR
            proposes the services and the owner's work is correcting lines
            within them; this is the fallback for a job the reading missed, not
            something to reach for. */}
        <button className="flow-link flow-link--quiet" type="button" onClick={addService}>
          {t('lines.addService')}
        </button>
        <span className="flow-note">
          {t('lines.inOrder')}
        </span>
      </div>

      {/* The kind is not cosmetic: only a labour line says which part of the
          vehicle was worked on, so calling a tin of degreaser a Part puts a
          component on a vehicle that never had one.

          The old editor repeated this explanation under every single line. In
          a flat table that is the same four sentences five times over, so it
          is stated once here instead — collapsed, because most receipts are
          kinded correctly on the first read and only the unsure need it. */}
      <details className="flow-kinds">
        <summary>{t('lines.whatKindsMean')}</summary>
        <dl>
          {LINE_KINDS.map((kind) => (
            <div key={kind.value}>
              <dt>{kind.label}</dt>
              <dd>{kind.hint}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
