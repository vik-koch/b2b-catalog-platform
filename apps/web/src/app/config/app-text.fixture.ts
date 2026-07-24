import { AppText } from './app-text.type';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { appTextSchema } from './app-text.type';

/**
 * Complete, schema-shaped demo UI text for tests only.
 */
export const defaultAppText: AppText = loadDefaultAppText();

function loadDefaultAppText(): AppText {
  const APP_TEXT_ENV_VAR = 'APP_TEXT_FILE';
  process.env[APP_TEXT_ENV_VAR] = '/config/app-text.json';
  return loadConfig(appTextSchema, APP_TEXT_ENV_VAR);
}
