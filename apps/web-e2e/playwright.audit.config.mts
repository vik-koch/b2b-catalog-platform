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
 * The baselines are working material, not documentation, so they stay out of
 * the repo in `tmp/baselines/`.
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
  // Each check names its own folder: tmp/baselines/<check>/<project>/<page>.
  snapshotPathTemplate: join(root, 'tmp/baselines/{arg}{ext}'),
  // Every page is read-only for the stack and opens in its own context, so
  // the pages run side by side; the stack's one SSR process is the limit.
  workers: 8,
  fullyParallel: true,
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
