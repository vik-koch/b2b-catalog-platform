import { InjectionToken, Provider } from '@angular/core';
import { readShellState } from './shell-state';

/**
 * Whether this deployment has a suggestion provider behind it (ADR 0041).
 *
 * Not part of the deployment config: the provider is one URL in the
 * environment, read by the API to call it and by the rendering process to say
 * whether it is there at all — two readers of one variable rather than a second
 * copy of the same fact in a file that can disagree with it.
 *
 * A form that suggests may ask for the street alone and let a pick fill the
 * rest; without a provider that form would be a dead end, so it asks for every
 * field up front instead.
 */
export const SUGGESTIONS_ENABLED = new InjectionToken<boolean>(
  'SUGGESTIONS_ENABLED',
);

/** Browser provider: reads the flag the server injected into the document. */
export function provideSuggestionsEnabled(): Provider {
  return {
    provide: SUGGESTIONS_ENABLED,
    useFactory: () => readShellState('suggestionsEnabled'),
  };
}
