#!/usr/bin/env node
/**
 * Fills the generated sections of `docs/catalog-sync.md`.
 *
 * What is generated is the journeys — the very literals `sync-journeys.spec.ts`
 * walks against the running API — and their legend. The prose around them is
 * written by hand and left alone.
 *
 * Run `node tools/generate-catalog-sync.mjs` after changing a sync journey.
 * `--check` verifies the committed document matches, which is what CI runs.
 */
import { readFileSync } from 'node:fs';
import {
  formatted,
  injectSection,
  loadTypeScript,
  writeOrCheck,
} from './lib/generated-docs.mjs';
import { journeyLegend, journeyTables } from './lib/journey-docs.mjs';

const DOC = 'docs/catalog-sync.md';
const COMMAND = 'tools/generate-catalog-sync.mjs';

const { syncJourneys } = await loadTypeScript(
  'apps/api-e2e/src/journeys/sync.journeys.ts',
);
const { SYNC_PROBES } = await loadTypeScript(
  'apps/api-e2e/src/journeys/sync-probe-labels.ts',
);
const { mailPreviewByKind } = await loadTypeScript(
  'apps/api/src/mail/mail-previews.ts',
);

let document = readFileSync(DOC, 'utf8');
document = injectSection(
  document,
  'sync-journeys',
  journeyTables(syncJourneys, SYNC_PROBES, mailPreviewByKind, {
    given: 'The feed.',
    fresh: 'It has not run yet.',
  }),
);
document = injectSection(
  document,
  'journey-legend',
  journeyLegend(SYNC_PROBES),
);

writeOrCheck({ [DOC]: formatted(document, 'markdown') }, COMMAND);
