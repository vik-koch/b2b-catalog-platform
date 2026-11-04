import { Provider } from '@angular/core';
import { SUGGESTIONS_ENABLED } from './suggestions-enabled';

export function getSuggestionsEnabled(): boolean {
  return Boolean(process.env['SUGGESTION_SIDECAR_URL']);
}

export function provideServerSuggestionsEnabled(): Provider {
  return { provide: SUGGESTIONS_ENABLED, useFactory: getSuggestionsEnabled };
}
