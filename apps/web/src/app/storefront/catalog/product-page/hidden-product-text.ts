import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import {
  editModeText,
  loadEditModeText,
} from '../../../platform/edit-mode/edit-mode-text';

/** The admin words a hidden product's page shows, fetched once one is in
 * hand. Browser only, where the file is served: the server keeps the
 * placeholder, so the first frame matches it. */
export function hiddenProductText(isHidden: () => boolean) {
  const failed = signal(false);
  const status = editModeText;
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    effect(() => {
      if (isHidden()) loadEditModeText().catch(() => failed.set(true));
    });
  }
  return {
    /** Null until the wording has arrived, or for good where it failed. */
    status,
    noPrice: computed(() => editModeText()?.unpricedMessage ?? null),
    /** Arrived or given up on: the page may be drawn either way. */
    settled: computed(() => status() !== null || failed()),
  };
}
