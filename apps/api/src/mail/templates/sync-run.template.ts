import { SyncRun } from '@b2b-catalog-platform/shared';
import { MailContent, MailRow } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * What an automated catalog sync writes to the shop (FR-ADM-07/09).
 *
 * Four messages in one file, because they are four outcomes of the same event
 * and say them with the same facts: the run, when it started, what it called
 * itself, which credential sent it. Only the sentence at the top and where the
 * button goes differ, so a reader following a broken feed across two mails is
 * reading one description of one thing.
 *
 * Every mail links to the run rather than describing it in full. A mail is
 * read on a phone and the decision is not one to take there — what it has to
 * do is say something happened and be one tap from where it can be answered.
 */

/** How a run is identified in any of the four: the same three lines, in the
 * same order, so two mails about one feed line up. */
function runRows(run: SyncRun, text: MailText, formatted: string): MailRow[] {
  const t = text.syncRun;
  const rows: MailRow[] = [{ label: t.startedLabel, value: formatted }];
  // A label is what the source chose to call its export. Absent on a failure
  // reported before there was one, and a blank row there would read as a
  // detail that went missing.
  if (run.filename) rows.push({ label: t.labelLabel, value: run.filename });
  if (run.tokenName) rows.push({ label: t.sourceLabel, value: run.tokenName });
  return rows;
}

/** Created, updated and hidden as one line — the three the reader acts on.
 * Unchanged rows are left out: a feed of ten thousand products that moved two
 * prices should read as two. */
function changes(run: SyncRun, text: MailText): MailRow[] {
  const summary = run.summary;
  if (!summary) return [];
  return [
    {
      label: text.syncRun.changesLabel,
      value: `+${summary.create} ~${summary.update} −${summary.softDelete}`,
    },
  ];
}

const runPath = (run: SyncRun): string => `/admin/sync/runs/${run.id}`;

/**
 * The feed stopped working (`fault` audience). The admin cannot fix it, so the
 * body says what is true for them — the shop is unchanged and going stale —
 * rather than anything about the exchange itself.
 *
 * `run.error` is the automated source's own account of what broke, which is
 * the one thing here nobody can look up: the run page has everything else.
 */
export function syncFailedMail(
  run: SyncRun,
  started: string,
  text: MailText,
): MailContent {
  const t = text.syncRun.kinds.failed;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [
      ...runRows(run, text, started),
      ...(run.error
        ? [{ label: text.syncRun.errorLabel, value: run.error }]
        : []),
    ],
    action: { label: t.action, path: runPath(run) },
  };
}

/** It works again (`fault` audience). Sent once, to whoever was told it was
 * broken, so an announced failure is never left open. */
export function syncRecoveredMail(
  run: SyncRun,
  started: string,
  text: MailText,
): MailContent {
  const t = text.syncRun.kinds.recovered;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [...runRows(run, text, started), ...changes(run, text)],
    action: { label: t.action, path: runPath(run) },
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
): MailContent {
  const t = text.syncRun.kinds.waiting;
  const reason = run.stagedReason
    ? [
        {
          label: text.syncRun.reasonLabel,
          value: text.syncRun.reasons[run.stagedReason],
        },
      ]
    : [];
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [...runRows(run, text, started), ...changes(run, text), ...reason],
    action: { label: t.action, path: runPath(run) },
  };
}

/**
 * A run applied itself and brought new products (`admins` audience).
 *
 * The only one of the four that does not link to the run: what is waiting is
 * not a decision about the import — that is already made — but a product page
 * to write, so it opens the list of everything awaiting publication. That the
 * list may hold more than this run brought is the point; it is the queue.
 */
export function syncCreatedMail(
  run: SyncRun,
  started: string,
  text: MailText,
): MailContent {
  const t = text.syncRun.kinds.created;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [...runRows(run, text, started), ...changes(run, text)],
    action: { label: t.action, path: '/admin/products?state=unpublished' },
  };
}
