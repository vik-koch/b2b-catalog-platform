import { inject, InjectionToken, Provider } from '@angular/core';
import type { SharedText } from '@b2b-catalog-platform/shared';
import { UI_TEXT, UiText } from '../ui/ui-text';
import { readShellState } from './shell-state';

export const SHARED_TEXT = new InjectionToken<SharedText>('SHARED_TEXT');

/** Browser provider: reads the shared names the server injected into the
 * document, beside the app text. */
export function provideSharedText(): Provider {
  return {
    provide: SHARED_TEXT,
    useFactory: () => readShellState('sharedText'),
  };
}

/** The lib's words, which the shared text carries under the same keys. */
export function provideUiText(): Provider {
  return { provide: UI_TEXT, useFactory: (): UiText => inject(SHARED_TEXT) };
}
