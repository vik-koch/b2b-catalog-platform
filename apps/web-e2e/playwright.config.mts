import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

// Smoke test against the deploy stack (compose.yml + compose.override.yml),
// started and seeded by ./src/support/global-setup.ts. BASE_URL overrides the
// target, e.g. to point at a deployed environment.
const baseURL = process.env['BASE_URL'] || 'http://localhost:8080';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  globalSetup: './src/support/global-setup.ts',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    // The demo asks before it loads the contact page's map, and its banner
    // sits over the foot of every page. Every spec starts with that question
    // answered, so a fixed card cannot cover the button a test clicks;
    // cookie-consent.spec.ts starts without it. The shape and version are
    // ConsentService's.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            {
              name: 'cookie-consent',
              value: JSON.stringify({
                version: 1,
                choice: 'accepted',
                timestamp: '2026-01-01T00:00:00.000Z',
              }),
            },
          ],
        },
      ],
    },
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // NFR-SEO-03 (responsive layout): every spec also runs on a phone
    // viewport; specs use the isMobile fixture where interaction differs.
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
