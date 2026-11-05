import {
  SharedText,
  sharedTextSchema,
} from '@b2b-catalog-platform/shared/platform';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/** The shop's shared names (see deployments/fixture/config/README.md), read whole at boot. */
export const SHARED_TEXT = 'SHARED_TEXT';

export function loadSharedText(): SharedText {
  return loadConfig(sharedTextSchema, 'texts/shared.json');
}

/** An area's block of the shared text, checked with the whole file at boot. */
export function sharedTextBlock<T>(text: SharedText, area: string): T {
  return (text as unknown as Record<string, T>)[area];
}
