import { Provider } from '@angular/core';
import { CommonText, commonTextSchema } from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { COMMON_TEXT } from './common-text';

// Read once per process and lazily, like the app text: the production build
// imports this module without any runtime environment.
let cachedCommonText: CommonText | undefined;

export function getCommonText(): CommonText {
  return (cachedCommonText ??= loadConfig(
    commonTextSchema,
    'texts/common.json',
  ));
}

/** Called at startup so a missing or invalid file fails the boot. */
export function preloadCommonText(): void {
  getCommonText();
}

export function provideServerCommonText(): Provider {
  return { provide: COMMON_TEXT, useFactory: getCommonText };
}
