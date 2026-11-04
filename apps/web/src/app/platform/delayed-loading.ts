import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  PLATFORM_ID,
  Signal,
  effect,
  inject,
  signal,
} from '@angular/core';

/** Under this, a skeleton reads as a flicker rather than as feedback. */
const LOADING_FEEDBACK_DELAY_MS = 500;

/**
 * A loading flag that turns true only once a load has lasted, and false the
 * moment it ends. Always false on the server, which renders the data. Call in
 * an injection context:
 *
 *   protected readonly showSkeleton = delayedLoading(this.data.isLoading);
 */
export function delayedLoading(
  loading: Signal<boolean>,
  delayMs = LOADING_FEEDBACK_DELAY_MS,
): Signal<boolean> {
  const visible = signal(false);
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return visible.asReadonly();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    if (loading()) {
      // A flapping source must not keep pushing the deadline away.
      timer ??= setTimeout(() => visible.set(true), delayMs);
    } else {
      clearTimeout(timer);
      timer = undefined;
      visible.set(false);
    }
  });
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return visible.asReadonly();
}
