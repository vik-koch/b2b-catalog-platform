import { InjectionToken, Provider } from '@angular/core';
import type { CommonText } from '@b2b-catalog-platform/shared';
import { readShellState } from './shell-state';

export const COMMON_TEXT = new InjectionToken<CommonText>('COMMON_TEXT');

/** Browser provider: reads the shared names the server injected into the
 * document, beside the app text. */
export function provideCommonText(): Provider {
  return {
    provide: COMMON_TEXT,
    useFactory: () => readShellState('commonText'),
  };
}
