#!/usr/bin/env node
/**
 * Fills the generated sections of `docs/order-lifecycle.md` from the rules
 * themselves.
 *
 * Where an order may go, who may take it there, what a move does to the money
 * and whether it offers to write to the customer are all answered by
 * `libs/shared/src/lib/order-transitions.ts`, and both apps read that answer at
 * runtime. A table typed out beside it would be a third copy, and the one that
 * silently stops being true. So the tables and the diagram are rendered from
 * the same functions the API refuses transitions with.
 *
 * The prose around the markers is written by hand and left alone.
 *
 * Run `node tools/generate-order-lifecycle.mjs` after changing the transition
 * table. `--check` verifies the committed document matches, which is what CI
 * runs.
 */
import { readFileSync } from 'node:fs';
import {
  formatted,
  injectSection,
  loadTypeScript,
  writeOrCheck,
} from './lib/generated-docs.mjs';

const DOC = 'docs/order-lifecycle.md';
const COMMAND = 'tools/generate-order-lifecycle.mjs';

const shared = await loadTypeScript('libs/shared/src/index.ts');
const { orderJourneys } = await loadTypeScript(
  'apps/api-e2e/src/journeys/orders.journeys.ts',
);
const { ORDER_PROBES } = await loadTypeScript(
  'apps/api-e2e/src/journeys/order-probe-labels.ts',
);
const { mailPreviewByKind } = await loadTypeScript(
  'apps/api/src/mail/mail-previews.ts',
);
const {
  ORDER_STATUSES,
  allowedTransitions,
  moveDirection,
  notifyByDefault,
  paymentStateWithoutPayment,
  transitionNeedsReason,
} = shared;

/** Statuses off the forward chain, which the diagram draws to one side. */
const ENDINGS = new Set(['declined', 'cancelled']);

const list = (values) =>
  values.length === 0 ? '—' : values.map((value) => `\`${value}\``).join(' · ');

/** What an order stands to owe at each state, before anyone records a payment. */
function whereItStands() {
  const rows = ORDER_STATUSES.map((status) => {
    const staff = allowedTransitions('staff', status);
    const customer = allowedTransitions('customer', status);
    return `| \`${status}\` | ${list(staff)} | ${list(customer)} | \`${paymentStateWithoutPayment(
      status,
      'bank-transfer',
    )}\` |`;
  });
  return [
    '| Where the order stands | A manager may move it to | The customer may | Invoiced order owes |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/**
 * Every move, with the three things a manager cannot see from the button: which
 * way it runs, whether it has to be explained, and whether it offers to write
 * to the customer with the box already ticked.
 *
 * The default is shown for a customer who has been told nothing yet, which is
 * the case it is designed for; a move to a status they have already had a mail
 * about is offered unticked.
 */
function moves() {
  const rows = [];
  for (const from of ORDER_STATUSES) {
    for (const to of allowedTransitions('staff', from)) {
      rows.push(
        `| \`${from}\` → \`${to}\` | staff | ${moveDirection(from, to)} | ${
          transitionNeedsReason(to, 'staff') ? 'required' : '—'
        } | ${notifyByDefault(from, to, []) ? 'ticked' : 'unticked'} |`,
      );
    }
    for (const to of allowedTransitions('customer', from)) {
      rows.push(
        `| \`${from}\` → \`${to}\` | customer | ${moveDirection(from, to)} | ${
          transitionNeedsReason(to, 'customer') ? 'required' : 'optional'
        } | n/a |`,
      );
    }
  }
  return [
    '| Move | Who | Direction | Reason | Mail offered |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/**
 * The same table as a picture. Staff moves are drawn; the customer's single
 * move is labelled as theirs, because it is the only one they have and reading
 * the diagram without it would suggest the shop is the only actor.
 */
function diagram() {
  const lines = ['```mermaid', 'stateDiagram-v2', '  [*] --> requested'];
  for (const from of ORDER_STATUSES) {
    for (const to of allowedTransitions('staff', from)) {
      const label =
        moveDirection(from, to) === 'backward'
          ? 'undo'
          : ENDINGS.has(to)
            ? 'with a reason'
            : 'staff';
      lines.push(`  ${from} --> ${to}: ${label}`);
    }
    for (const to of allowedTransitions('customer', from)) {
      lines.push(`  ${from} --> ${to}: customer calls it off`);
    }
  }
  lines.push('  completed --> [*]', '```');
  return lines.join('\n');
}

/**
 * How one reading prints. Kept dumb on purpose: a value that needs explaining
 * in the documentation needs a better name in the journey.
 *
 * The exception is mail, where the name of a message is also the way to go and
 * read it — the gallery holds every one of them.
 */
function value(probe, reading) {
  const one = (entry) =>
    probe === 'mail' && mailPreviewByKind[entry]
      ? `[\`${entry}\`](mail.md#${mailPreviewByKind[entry]})`
      : `\`${entry}\``;
  if (Array.isArray(reading)) {
    return reading.length === 0 ? 'nothing' : reading.map(one).join(' · ');
  }
  return typeof reading === 'string' ? one(reading) : String(reading);
}

const changes = (expectations) =>
  Object.entries(expectations ?? {})
    .map(
      ([probe, reading]) =>
        `${ORDER_PROBES[probe].label}: ${value(probe, reading)}`,
    )
    .join('<br>') || '—';

/** What each column of every journey table is answering. */
function legend() {
  return Object.values(ORDER_PROBES)
    .map((probe) => `- **${probe.label}** — ${probe.meaning}`)
    .join('\n');
}

/**
 * The journeys, from the same literals `order-journeys.spec.ts` walks against
 * the running API.
 *
 * A cell that says nothing is not a gap: every step asserts the whole state,
 * so an unmentioned reading is being asserted *unchanged*, and an unmentioned
 * mail is being asserted not to have been sent. That is the point of the two
 * quiet steps in the second journey.
 *
 * Each journey's steps are folded away. There are more of them than anybody
 * reads at once, and the summary line — what the journey is and what it covers
 * — is the part somebody scanning the document is looking for.
 */
function journeys() {
  return orderJourneys
    .map((journey) => {
      const rows = journey.steps.map(
        (step, index) =>
          `| ${index + 1} | ${step.what} | ${step.actor} | ${changes(step.expect)} |`,
      );
      const from = journey.from?.length
        ? journey.from.map((step) => step.what).join(' ')
        : 'It has just been placed.';
      return [
        '<details>',
        `<summary><b>${journey.title}</b> — ${journey.note}</summary>`,
        '',
        `**The order.** ${journey.given}`,
        '',
        `**Starting from.** ${from}`,
        '',
        ...(journey.start
          ? [`**Which leaves it.** ${changes(journey.start)}`, '']
          : []),
        '| # | What happens | Who | What changes |',
        '| --- | --- | --- | --- |',
        ...rows,
        '',
        '</details>',
      ].join('\n');
    })
    .join('\n\n');
}

let document = readFileSync(DOC, 'utf8');
document = injectSection(document, 'order-states', whereItStands());
document = injectSection(document, 'order-moves', moves());
document = injectSection(document, 'order-diagram', diagram());
document = injectSection(document, 'order-journeys', journeys());
document = injectSection(document, 'journey-legend', legend());

writeOrCheck({ [DOC]: formatted(document, 'markdown') }, COMMAND);
