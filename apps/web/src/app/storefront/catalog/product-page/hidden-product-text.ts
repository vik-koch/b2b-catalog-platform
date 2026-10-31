import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
// eslint-disable-next-line no-restricted-imports -- until the texts are cut by area: edit mode is staff reading a storefront page
import { adminText, loadAdminText } from '../../../shared/config/admin-text';

/** The admin words a hidden product's page shows, fetched once one is in
 * hand. Browser only, where the file is served: the server keeps the
 * placeholder, so the first frame matches it. */
export function hiddenProductText(isHidden: () => boolean) {
  const failed = signal(false);
  const status = computed(() => adminText()?.products ?? null);
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    effect(() => {
      if (isHidden()) loadAdminText().catch(() => failed.set(true));
    });
  }
  return {
    /** Null until the wording has arrived, or for good where it failed. */
    status,
    noPrice: computed(
      () => adminText()?.catalogErrors['product-has-no-price'] ?? null,
    ),
    /** Arrived or given up on: the page may be drawn either way. */
    settled: computed(() => status() !== null || failed()),
  };
}
