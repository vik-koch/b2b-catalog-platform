import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { AppText, appTextSchema } from './app-text.type';

/**
 * Complete, schema-shaped demo UI text for tests only. Loaded from the same
 * committed config file the app serves at runtime, via the normal APP_TEXT_FILE
 * env var Nx reads from .env (CI copies .env.example first) — so the fixture
 * can't drift from the real demo text and invents no test-only env var.
 */
export const defaultAppText: AppText = loadConfig(
  appTextSchema,
  'APP_TEXT_FILE',
);
