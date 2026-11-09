import { inject, InjectionToken, Provider } from '@angular/core';

import { type SharedText } from '@b2b-catalog-platform/shared/platform';
import { UI_TEXT, UiText } from '@b2b-catalog-platform/ui/core/ui-text';

import { readShellState } from './shell-state';

export const SHARED_TEXT = new InjectionToken<SharedText>('SHARED_TEXT');

/** In the browser, from the document (see shell-state.ts). */
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

/** An area's block of the shared text. Typed apart, but the server checks the
 * file whole against every area's shape, so the block is always there. */
export function sharedTextBlock<T>(text: SharedText, area: string): T {
  return (text as unknown as Record<string, T>)[area];
}
