import { AppText } from './app-text.type';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { appTextSchema } from './app-text.type';

/**
 * Complete, schema-shaped demo UI text for tests only.
 */
export const defaultAppText: AppText = loadDefaultAppText();

function loadDefaultAppText(): AppText {
  process.env['APP_TEXT'] = 'config/app-text.json';
  return loadConfig(appTextSchema, 'APP_TEXT');
}
