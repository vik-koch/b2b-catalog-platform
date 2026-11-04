import { InjectionToken, Provider } from '@angular/core';
import { readShellState } from './shell-state';

/** Whether a suggestion sidecar is configured: the environment's one URL, read
 * by the API and by this process, never a second copy in a config file. Without
 * it a form asks for every address field up front. */
export const SUGGESTIONS_ENABLED = new InjectionToken<boolean>(
  'SUGGESTIONS_ENABLED',
);

/** In the browser, from the document (see shell-state.ts). */
export function provideSuggestionsEnabled(): Provider {
  return {
    provide: SUGGESTIONS_ENABLED,
    useFactory: () => readShellState('suggestionsEnabled'),
  };
}
