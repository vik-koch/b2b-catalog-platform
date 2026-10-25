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
 * Mirrors a signal, but only after it has held still for a moment. Used to
 * keep a keystroke-driven request off every keystroke: the source updates as
 * fast as someone types, the copy updates once they pause.
 *
 * Unlike `delayedLoading`, every change restarts the timer — that is the whole
 * point of a debounce, and the reason a fast typist produces one request
 * rather than one per letter.
 *
 * On the server the source is returned unchanged: SSR has no keystrokes, and a
 * pending timer would only hold up serialisation.
 *
 * Must be called in an injection context (a field initialiser or a
 * constructor).
 */
export function debounced<T>(source: Signal<T>, delayMs: number): Signal<T> {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return source;

  const settled = signal(source());
  let timer: ReturnType<typeof setTimeout> | undefined;

  effect(() => {
    const value = source();
    clearTimeout(timer);
    timer = setTimeout(() => settled.set(value), delayMs);
  });
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return settled.asReadonly();
}
