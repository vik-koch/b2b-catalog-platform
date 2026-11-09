import { SyncRun } from '@b2b-catalog-platform/shared/core/exchange';

import { MailContent, MailRow } from '../../platform/mail/mail-layout';
import { MailText } from '../../platform/mail/mail-text';
import { exchangeMail } from './exchange-mail-text';

/**
 * What an automated exchange writes to the shop (FR-ADM-07/09, FR-NOTIF-09):
 * the three every area sends and the catalog's fourth, one event told with the
 * same facts. The words come from the run's own area, not a second argument
 * that could disagree. Each links to the run: a mail is read on a phone, and
 * the decision is taken elsewhere.
 */

/** The sentences for the area this run belongs to. */
function wording(run: SyncRun, text: MailText) {
  return exchangeMail(text).syncRun.areas[run.area];
}

/** How a run is identified in any of the four: the same three lines, in the
 * same order, so two mails about one feed line up. */
function runRows(run: SyncRun, text: MailText, formatted: string): MailRow[] {
  const t = exchangeMail(text).syncRun;
  const rows: MailRow[] = [{ label: t.startedLabel, value: formatted }];
  // A label is what the source chose to call its export. Absent on a failure
  // reported before there was one, and a blank row there would read as a
  // detail that went missing.
  if (run.filename) rows.push({ label: t.labelLabel, value: run.filename });
  if (run.tokenName) rows.push({ label: t.sourceLabel, value: run.tokenName });
  return rows;
}

/** Created, updated and hidden in one line. Unchanged rows are left out: ten
 * thousand products with two new prices read as two. */
function changes(run: SyncRun, text: MailText): MailRow[] {
  const summary = run.summary;
  if (!summary) return [];
  return [
    {
      label: exchangeMail(text).syncRun.changesLabel,
      value: `+${summary.create} ~${summary.update} −${summary.softDelete}`,
    },
  ];
}

const runPath = (run: SyncRun): string => `/admin/sync/runs/${run.id}`;

/** The feed stopped (`fault` audience). The admin cannot fix it, so it says
 * the shop is unchanged and going stale. `run.error` is the source's account,
 * the one thing the run page lacks. */
export function syncFailedMail(
  run: SyncRun,
  started: string,
  text: MailText,
): MailContent {
  const t = wording(run, text).failed;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [
      ...runRows(run, text, started),
      ...(run.error
        ? [{ label: exchangeMail(text).syncRun.errorLabel, value: run.error }]
        : []),
    ],
    action: { label: exchangeMail(text).syncRun.openRun, path: runPath(run) },
  };
}

/** It works again (`fault` audience). Sent once, to whoever was told it was
 * broken, so an announced failure is never left open. */
export function syncRecoveredMail(
  run: SyncRun,
  started: string,
  text: MailText,
): MailContent {
  const t = wording(run, text).recovered;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [...runRows(run, text, started), ...changes(run, text)],
    action: { label: exchangeMail(text).syncRun.openRun, path: runPath(run) },
  };
}

/**
 * A run is staged and nobody has decided it (`admins` audience).
 *
 * The reason is the substance: an ordinary large import and one whose parsing
 * the source itself doubts are two different things to open, and the screen
 * says which for the same reason.
 */
export function syncWaitingMail(
  run: SyncRun,
  started: string,
  text: MailText,
): MailContent | null {
  const area = wording(run, text);
  // An area whose runs never wait has no such text (`orderSyncMails`); the
  // text is the one place that knows which areas wait.
  if (!('waiting' in area)) return null;
  const t = area.waiting;
  const reason = run.stagedReason
    ? [
        {
          label: exchangeMail(text).syncRun.reasonLabel,
          value: exchangeMail(text).syncRun.reasons[run.stagedReason],
        },
      ]
    : [];
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [...runRows(run, text, started), ...changes(run, text), ...reason],
    action: { label: exchangeMail(text).syncRun.reviewRun, path: runPath(run) },
  };
}

/** A run applied itself and brought new products (`admins` audience),
 * catalog only. It opens the queue awaiting publication, not the run: what
 * waits is a product page to write. */
export function syncCreatedMail(
  run: SyncRun,
  started: string,
  text: MailText,
): MailContent {
  const t = exchangeMail(text).syncRun.areas.catalog.created;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [...runRows(run, text, started), ...changes(run, text)],
    action: { label: t.action, path: '/admin/products?state=unpublished' },
  };
}
