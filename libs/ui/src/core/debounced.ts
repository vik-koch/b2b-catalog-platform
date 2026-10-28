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
 * Mirrors a signal once it has held still for `delayMs`; every change restarts
 * the timer. On the server the source comes back unchanged: a pending timer
 * would only hold up serialisation. Call it in an injection context.
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
