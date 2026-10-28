import { DestroyRef, inject, PLATFORM_ID, signal, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Whether the pointer is a finger rather than a mouse; no width query can tell.
 * For how a control responds to a press, never for layout: the server answers
 * false, and the answer is in before anything can be pressed.
 */
export function injectCoarsePointer(): Signal<boolean> {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const coarse = signal(false);
  // A test environment may have no matchMedia.
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
