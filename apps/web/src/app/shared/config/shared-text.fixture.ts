import { SharedText, sharedTextSchema } from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/** The committed demo glossary, for tests only (see storefront-text.fixture.ts). */
export const defaultSharedText: SharedText = loadConfig(
  sharedTextSchema,
  'texts/shared.json',
);
