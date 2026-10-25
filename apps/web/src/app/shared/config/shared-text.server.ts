import { Provider } from '@angular/core';
import { SharedText, sharedTextSchema } from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { SHARED_TEXT } from './shared-text';

// Read once per process and lazily, like the app text: the production build
// imports this module without any runtime environment.
let cachedSharedText: SharedText | undefined;

export function getSharedText(): SharedText {
  return (cachedSharedText ??= loadConfig(
    sharedTextSchema,
    'texts/shared.json',
  ));
}

/** Called at startup so a missing or invalid file fails the boot. */
export function preloadSharedText(): void {
  getSharedText();
}

export function provideServerSharedText(): Provider {
  return { provide: SHARED_TEXT, useFactory: getSharedText };
}
