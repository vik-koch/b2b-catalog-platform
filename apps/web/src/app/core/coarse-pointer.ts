import { DestroyRef, inject, PLATFORM_ID, signal, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Whether the pointer on this device is a finger rather than a mouse, as a
 * signal.
 *
 * A width query cannot answer this: a tablet is as wide as a laptop and a
 * touchscreen laptop is both. What it decides is never layout — only how a
 * control responds to being pressed, so a server that has no pointer to
 * measure answering "fine" costs nothing: the first frame is the same either
 * way and the answer arrives before anything can be pressed.
 */
export function injectCoarsePointer(): Signal<boolean> {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const coarse = signal(false);
  // Guarded rather than assumed: a test environment may have no matchMedia,
  // and a media query is not worth a broken component.
  if (!isBrowser || typeof window.matchMedia !== 'function') {
    return coarse.asReadonly();
  }

  const list = window.matchMedia('(pointer: coarse)');
  const update = () => coarse.set(list.matches);
  update();
  list.addEventListener('change', update);
  inject(DestroyRef).onDestroy(() =>
    list.removeEventListener('change', update),
  );

  return coarse.asReadonly();
}
