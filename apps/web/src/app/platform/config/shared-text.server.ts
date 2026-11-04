import { Provider } from '@angular/core';
import { sharedTextSchema } from '@b2b-catalog-platform/shared/platform';
import { mountedFile } from './mounted-file.server';
import { SHARED_TEXT } from './shared-text';

export const getSharedText = mountedFile(sharedTextSchema, 'texts/shared.json');

/** At boot, so a bad file stops the start. */
export function preloadSharedText(): void {
  getSharedText();
}

export function provideServerSharedText(): Provider {
  return { provide: SHARED_TEXT, useFactory: getSharedText };
}
