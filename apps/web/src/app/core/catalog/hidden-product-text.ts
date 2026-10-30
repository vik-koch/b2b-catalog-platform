import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { adminText, loadAdminText } from '../../shared/config/admin-text';

/**
 * The admin wording a hidden product's page shows: its status badges, and why
 * it cannot be published. Fetched like every admin word, once a hidden product
 * is in hand, which only an admin has; in the browser only, where the file is
 * served, so the server's render keeps the placeholder and the browser's first
 * frame matches it.
 */
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
