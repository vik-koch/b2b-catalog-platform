import {
  SharedText,
  sharedTextSchema,
} from '@b2b-catalog-platform/shared/platform';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/** The fixture's shared text, for specs. */
export const defaultSharedText: SharedText = loadConfig(
  sharedTextSchema,
  'texts/shared.json',
);
