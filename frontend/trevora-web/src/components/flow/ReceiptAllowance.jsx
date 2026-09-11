import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useT } from '../../i18n/index.jsx';
import { getReceiptUsage } from '../../api/serviceDrafts';

/*
 * The owner's receipt page allowance, kept out of sight.
 *
 * The limits exist to stop bots running up the AI bill, not to ration honest
 * owners, so the receipt screen shows no meter and no counts. It says something
 * only when it matters:
 *
 * - the pages chosen will not fit what is left this hour (or today): come back
 *   at the reset time;
 * - the account was warned for spamming the receipt reader, or given a final
 *   warning before suspension.
 *
 * The numbers come from the same buckets the server charges. Reset times are
 * worked out against the server's clock and counted down locally, so a phone set
 * a few minutes wrong still shows the right time.
 */

const TICK_MS = 15_000;

/** Fetches the allowance, keeps its countdown current, and refetches when a window resets. */
export function useReceiptAllowance() {
  const [snapshot, setSnapshot] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const usage = await getReceiptUsage();
      setSnapshot({ usage, fetchedAt: Date.now() });
      setNow(Date.now());
      return usage;
    } catch {
      // Guidance only; the server still enforces the limit without it.
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const allowance = useMemo(() => (snapshot ? describeAllowance(snapshot, now) : null), [snapshot, now]);

  const resetPassed = Boolean(allowance?.resetPassed);
  useEffect(() => {
    if (resetPassed) refresh();
  }, [resetPassed, refresh]);

  return { allowance, refresh };
}

function describeAllowance({ usage, fetchedAt }, now) {
  const serverNow = Date.parse(usage.serverTime) || fetchedAt;
  const elapsed = now - fetchedAt;
  const reset = (iso) => {
    if (!iso) return null;
    const ms = Math.max(0, Date.parse(iso) - serverNow - elapsed);
    return { ms, at: new Date(now + ms) };
  };
  const hour = {
    limit: usage.pagesPerHour,
    used: usage.pagesUsedThisHour,
    left: Math.max(0, usage.pagesPerHour - usage.pagesUsedThisHour),
    reset: reset(usage.hourResetsAt),
  };
  const day = {
    limit: usage.pagesPerDay,
    used: usage.pagesUsedToday,
    left: Math.max(0, usage.pagesPerDay - usage.pagesUsedToday),
    reset: reset(usage.dayResetsAt),
  };
  return {
    hour,
    day,
    now,
    pagesLeft: Math.min(hour.left, day.left),
    maxPagesPerUpload: usage.maxPagesPerUpload,
    warningLevel: usage.warningLevel ?? 0,
    // Whichever window is holding the owner back is the one whose reset matters.
    binding: day.left < hour.left ? day : hour,
    resetPassed: (hour.reset?.ms === 0 && hour.used > 0) || (day.reset?.ms === 0 && day.used > 0),
  };
}

/** Whether an upload of this many pages would be refused before it is sent, and why. */
export function uploadBlock(allowance, pages) {
  if (!allowance || pages === 0) return null;
  if (pages > allowance.maxPagesPerUpload) return 'tooBig';
  if (pages > allowance.pagesLeft) return allowance.pagesLeft === 0 ? 'usedUp' : 'over';
  return null;
}

/** What kind of refusal an API error is: 'warning', 'finalWarning', 'limit', 'budget', or null. */
export function refusalFor(error) {
  if (error?.code === 'ABUSE_FINAL_WARNING') return 'finalWarning';
  if (error?.code === 'ABUSE_WARNING') return 'warning';
  if (error?.status === 429) return 'limit';
  if (error?.status === 503 && /\bAI\b/.test(String(error?.message || ''))) return 'budget';
  return null;
}

/** The spam warning to show, if the account has one -- from this refusal or from the last day. */
export function warningFor(allowance, refusal) {
  const fromRefusal = refusal === 'finalWarning' ? 2 : refusal === 'warning' ? 1 : 0;
  const level = Math.max(allowance?.warningLevel ?? 0, fromRefusal);
  if (level >= 2) return { tone: 'error', kind: 'finalWarning' };
  if (level === 1) return { tone: 'warn', kind: 'warning' };
  return null;
}

/**
 * The limit notice to show, if any. Nothing while the chosen pages fit -- the
 * limit only comes up when the owner is trying to read more than is left.
 */
export function noticeFor(allowance, selectedPages, refusal) {
  if (refusal === 'budget') return { tone: 'error', kind: 'budget' };
  const refused = refusal === 'limit' || refusal === 'warning' || refusal === 'finalWarning';
  if (!allowance) return refused ? { tone: 'error', kind: 'reachedNoTime' } : null;
  if (selectedPages > allowance.maxPagesPerUpload) return { tone: 'warn', kind: 'tooBig' };
  if (allowance.pagesLeft === 0) {
    return selectedPages > 0 || refused ? { tone: 'error', kind: 'reached' } : null;
  }
  if (selectedPages > allowance.pagesLeft) return { tone: 'error', kind: 'over' };
  // Refused although the pages fit: the per-minute burst limit.
  if (refused) return { tone: 'error', kind: 'burst' };
  return null;
}

function formatWhen(reset, now, t) {
  if (!reset) return '';
  const time = reset.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = reset.at.toDateString() === new Date(now).toDateString();
  return sameDay ? t('receiptLimit.at', { time }) : t('receiptLimit.tomorrowAt', { time });
}

function formatIn(ms, t) {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return t('receiptLimit.inMoment');
  if (minutes < 60) return t('receiptLimit.inMinutes', { n: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? t('receiptLimit.inHoursOnly', { h }) : t('receiptLimit.inHours', { h, m });
}

/**
 * The small lines the allowance puts on the receipt screen: a spam warning when
 * the account has one, and a limit notice when the chosen pages will not fit.
 * An amber line can be dismissed; a red one stays, because it explains why Read
 * did nothing.
 */
export function ReceiptAllowanceNotice({ allowance, selectedPages, refusal, onTypeInstead }) {
  const t = useT();
  const ref = useRef(null);
  const [dismissed, setDismissed] = useState(() => new Set());
  const warning = warningFor(allowance, refusal);
  const notice = noticeFor(allowance, selectedPages, refusal);

  useEffect(() => {
    if (refusal && ref.current) {
      ref.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  }, [refusal]);

  const dayBound = Boolean(allowance) && allowance.binding === allowance.day;
  const reset = allowance?.binding.reset ?? null;
  const when = allowance ? formatWhen(reset, allowance.now, t) : '';
  const inTime = reset ? formatIn(reset.ms, t) : '';
  const left = allowance?.pagesLeft ?? 0;

  const lines = [];
  if (warning) {
    lines.push({
      key: `warning:${warning.kind}`,
      tone: warning.tone,
      text: warning.kind === 'finalWarning' ? t('receiptLimit.finalWarning') : t('receiptLimit.warning'),
    });
  }
  if (notice) {
    const text = {
      reached: dayBound
        ? t('receiptLimit.reachedDay', { when, in: inTime })
        : t('receiptLimit.reachedHour', { when, in: inTime }),
      reachedNoTime: t('receiptLimit.reachedNoTime'),
      over: dayBound
        ? t('receiptLimit.overToday', { pages: selectedPages, left, when })
        : t('receiptLimit.over', { pages: selectedPages, left, when }),
      burst: t('receiptLimit.burst'),
      budget: t('receiptLimit.budget'),
      tooBig: t('receiptLimit.tooBig', { max: allowance?.maxPagesPerUpload ?? '' }),
    }[notice.kind];
    lines.push({
      key: `notice:${notice.kind}:${left}`,
      tone: notice.tone,
      text,
      action: notice.kind === 'reached' || notice.kind === 'budget' ? t('receiptLimit.typeInstead') : null,
    });
  }

  const visible = lines.filter((line) => line.tone !== 'warn' || !dismissed.has(line.key));
  if (visible.length === 0) return null;

  return (
    <div ref={ref} className="allowance-notes">
      {visible.map((line) => (
        <AllowanceNote
          key={line.key}
          tone={line.tone}
          text={line.text}
          actionLabel={line.action}
          onAction={onTypeInstead}
          dismissLabel={t('receiptLimit.dismiss')}
          onDismiss={() => setDismissed((current) => new Set(current).add(line.key))}
          icon={line.key.startsWith('warning') ? AlertTriangle : null}
        />
      ))}
    </div>
  );
}

function AllowanceNote({ tone, text, actionLabel, onAction, dismissLabel, onDismiss, icon }) {
  const Icon = icon ?? (tone === 'error' ? AlertCircle : Info);
  return (
    <div className={`allowance-note allowance-note--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="allowance-note__icon" size={18} strokeWidth={2} aria-hidden="true" />
      <p className="allowance-note__text">
        {text}
        {actionLabel && (
          <>
            {' '}
            <button className="allowance-note__link" type="button" onClick={onAction}>
              {actionLabel}
            </button>
          </>
        )}
      </p>
      {tone === 'warn' && (
        <button className="allowance-note__close" type="button" aria-label={dismissLabel} onClick={onDismiss}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
