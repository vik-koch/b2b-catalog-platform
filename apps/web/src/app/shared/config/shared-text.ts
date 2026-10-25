import { InjectionToken, Provider } from '@angular/core';
import type { SharedText } from '@b2b-catalog-platform/shared';
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
