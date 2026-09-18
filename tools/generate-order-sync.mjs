#!/usr/bin/env node
/**
 * Fills the generated sections of `docs/order-sync.md`.
 *
 * What is generated is the journeys — the very literals
 * `order-sync-journeys.spec.ts` walks against the running API — and their
 * legend. The prose around them is written by hand and left alone.
 *
 * Run `node tools/generate-order-sync.mjs` after changing an order-exchange
 * journey. `--check` verifies the committed document matches, which is what CI
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

const DOC = 'docs/order-sync.md';
const COMMAND = 'tools/generate-order-sync.mjs';

const { orderSyncJourneys } = await loadTypeScript(
  'apps/api-e2e/src/journeys/order-sync.journeys.ts',
);
const { ORDER_SYNC_PROBES } = await loadTypeScript(
  'apps/api-e2e/src/journeys/order-sync-probe-labels.ts',
);
const { mailPreviewByKind } = await loadTypeScript(
  'apps/api/src/mail/mail-previews.ts',
);

let document = readFileSync(DOC, 'utf8');
document = injectSection(
  document,
  'order-sync-journeys',
  journeyTables(orderSyncJourneys, ORDER_SYNC_PROBES, mailPreviewByKind, {
    given: 'The order.',
    fresh: 'The order as the customer placed it, unanswered.',
  }),
);
document = injectSection(
  document,
  'journey-legend',
  journeyLegend(ORDER_SYNC_PROBES),
);

writeOrCheck({ [DOC]: formatted(document, 'markdown') }, COMMAND);
