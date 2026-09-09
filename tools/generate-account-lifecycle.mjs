#!/usr/bin/env node
/**
 * Fills the generated sections of `docs/account-lifecycle.md`.
 *
 * Accounts have no single table the way orders do — what an account may become
 * is decided by guards spread across the staff-users service — so what is
 * generated here is the set of statuses (from the constant both apps read) and
 * the journeys, which come from the very literals `account-journeys.spec.ts`
 * walks against the running API. The prose around them is written by hand and
 * left alone.
 *
 * Run `node tools/generate-account-lifecycle.mjs` after changing an account
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

const DOC = 'docs/account-lifecycle.md';
const COMMAND = 'tools/generate-account-lifecycle.mjs';

const { USER_STATUSES, USER_ROLES } = await loadTypeScript(
  'libs/shared/src/index.ts',
);
const { accountJourneys } = await loadTypeScript(
  'apps/api-e2e/src/journeys/accounts.journeys.ts',
);
const { ACCOUNT_PROBES } = await loadTypeScript(
  'apps/api-e2e/src/journeys/account-probe-labels.ts',
);
const { mailPreviewByKind } = await loadTypeScript(
  'apps/api/src/mail/mail-previews.ts',
);

const list = (values) => values.map((value) => `\`${value}\``).join(' · ');

let document = readFileSync(DOC, 'utf8');
document = injectSection(
  document,
  'account-statuses',
  `An account is in exactly one of these: ${list(USER_STATUSES)}. Its role is one of ${list(USER_ROLES)}.`,
);
document = injectSection(
  document,
  'account-journeys',
  journeyTables(accountJourneys, ACCOUNT_PROBES, mailPreviewByKind, {
    given: 'The account.',
    fresh: 'Nothing has happened to it yet.',
  }),
);
document = injectSection(
  document,
  'journey-legend',
  journeyLegend(ACCOUNT_PROBES),
);

writeOrCheck({ [DOC]: formatted(document, 'markdown') }, COMMAND);
