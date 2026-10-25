import { SharedText, sharedTextSchema } from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/** The shop's shared names (see deployments/fixture/config/README.md), read whole at boot. */
export const SHARED_TEXT = 'SHARED_TEXT';

export function loadSharedText(): SharedText {
  return loadConfig(sharedTextSchema, 'texts/shared.json');
}
