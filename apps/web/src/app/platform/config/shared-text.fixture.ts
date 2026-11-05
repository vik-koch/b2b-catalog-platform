import {
  SharedTextFile,
  sharedTextSchema,
} from '@b2b-catalog-platform/shared/deployment';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/** The fixture's shared text whole, for specs. */
export const defaultSharedText: SharedTextFile = loadConfig(
  sharedTextSchema,
  'texts/shared.json',
);
