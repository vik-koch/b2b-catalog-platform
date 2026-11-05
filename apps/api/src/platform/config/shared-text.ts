import type { SharedText } from '@b2b-catalog-platform/shared/platform';

/** The shop's shared names (see deployments/fixture/config/README.md), read
 * whole at boot by the root. */
export const SHARED_TEXT = 'SHARED_TEXT';

/** An area's block of the shared text, checked with the whole file at boot. */
export function sharedTextBlock<T>(text: SharedText, area: string): T {
  return (text as unknown as Record<string, T>)[area];
}
