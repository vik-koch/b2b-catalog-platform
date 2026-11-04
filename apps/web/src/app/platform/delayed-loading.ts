import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  PLATFORM_ID,
  Signal,
  effect,
  inject,
  signal,
} from '@angular/core';

/**
 * How long a load may take before it is worth admitting to. Under this, the
 * content usually arrives within a frame or two of the skeleton, and the
 * skeleton reads as a flicker rather than as feedback.
 */
export const LOADING_FEEDBACK_DELAY_MS = 500;

/**
 * Wraps a loading flag so it only turns true once loading has actually lasted a
 * noticeable moment — the standard fix for skeletons that flash and vanish on
 * fast navigations. Falling edges are immediate: the instant data arrives, the
 * skeleton goes, whether or not it ever appeared.
 *
 * Always false on the server. SSR waits for the data before it serialises, so
 * the rendered HTML carries real content and never a skeleton.
 *
 * Must be called in an injection context (a field initialiser or a constructor).
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
      // Already counting down: let the original deadline stand, so a flapping
      // source cannot keep pushing the skeleton further away.
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
