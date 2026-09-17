#!/usr/bin/env node
/**
 * Fills the generated sections of `docs/customer-sync.md`.
 *
 * What is generated is the journeys — the very literals
 * `customer-sync-journeys.spec.ts` walks against the running API — and their
 * legend. The prose around them is written by hand and left alone.
 *
 * Run `node tools/generate-customer-sync.mjs` after changing a customer
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

const DOC = 'docs/customer-sync.md';
const COMMAND = 'tools/generate-customer-sync.mjs';

const { customerSyncJourneys } = await loadTypeScript(
  'apps/api-e2e/src/journeys/customer-sync.journeys.ts',
);
const { CUSTOMER_SYNC_PROBES } = await loadTypeScript(
  'apps/api-e2e/src/journeys/customer-sync-probe-labels.ts',
);
const { mailPreviewByKind } = await loadTypeScript(
  'apps/api/src/mail/mail-previews.ts',
);

let document = readFileSync(DOC, 'utf8');
document = injectSection(
  document,
  'customer-sync-journeys',
  journeyTables(customerSyncJourneys, CUSTOMER_SYNC_PROBES, mailPreviewByKind, {
    given: 'The exchange.',
    fresh: 'Nothing has asked for this account yet.',
  }),
);
document = injectSection(
  document,
  'journey-legend',
  journeyLegend(CUSTOMER_SYNC_PROBES),
);

writeOrCheck({ [DOC]: formatted(document, 'markdown') }, COMMAND);
