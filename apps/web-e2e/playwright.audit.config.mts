import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import base from './playwright.config.mts';

const root = join(import.meta.dirname, '../..');

/**
 * The audit run: a screenshot and an accessibility check of every page in
 * `src/audit/routes.ts`, on the same freshly seeded stack the e2e suite uses.
 * Run by hand around a change that moves markup (`nx run web-e2e:audit`, with
 * `-- --update-snapshots` to take the baseline first); CI does not run it.
 *
 * The screenshots are a working baseline, not documentation, so they stay out
 * of the repo in `tmp/baselines/visual/`.
 */
export default defineConfig({
  ...base,
  testDir: './src/audit',
  testIgnore: [],
  outputDir: join(root, 'dist/.playwright/apps/web-e2e/audit-output'),
  reporter: [
    [
      'html',
      {
        outputFolder: join(root, 'dist/.playwright/apps/web-e2e/audit-report'),
        open: 'never',
      },
    ],
    ['list'],
  ],
  snapshotPathTemplate: join(
    root,
    'tmp/baselines/visual/{projectName}/{arg}{ext}',
  ),
  // One page at a time: a parallel run on one machine renders fonts and
  // images under different load, which shows up as pixel noise.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide' },
  },
  projects: [
    { name: 'sign-in', testMatch: /sign-in\.setup\.ts/ },
    ...(base.projects ?? []).map((project) => ({
      ...project,
      dependencies: ['sign-in'],
    })),
  ],
});
