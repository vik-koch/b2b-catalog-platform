import { Provider } from '@angular/core';
import { SUGGESTIONS_ENABLED } from './suggestions-enabled';

/**
 * The environment's answer, read on the Node side. Optional by design: unset
 * is a deployment that types its addresses, which is what the open deployment
 * ships.
 */
export function getSuggestionsEnabled(): boolean {
  return Boolean(process.env['SUGGESTION_SIDECAR_URL']);
}

/** Server provider, and the source of the flag injected into every document
 * (see shell-state.server.ts). */
export function provideServerSuggestionsEnabled(): Provider {
  return { provide: SUGGESTIONS_ENABLED, useFactory: getSuggestionsEnabled };
}
