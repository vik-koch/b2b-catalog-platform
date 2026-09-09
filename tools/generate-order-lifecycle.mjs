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
import { journeyLegend, journeyTables } from './lib/journey-docs.mjs';

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

let document = readFileSync(DOC, 'utf8');
document = injectSection(document, 'order-states', whereItStands());
document = injectSection(document, 'order-moves', moves());
document = injectSection(document, 'order-diagram', diagram());
document = injectSection(
  document,
  'order-journeys',
  journeyTables(orderJourneys, ORDER_PROBES, mailPreviewByKind, {
    given: 'The order.',
    fresh: 'It has just been placed.',
  }),
);
document = injectSection(
  document,
  'journey-legend',
  journeyLegend(ORDER_PROBES),
);

writeOrCheck({ [DOC]: formatted(document, 'markdown') }, COMMAND);
