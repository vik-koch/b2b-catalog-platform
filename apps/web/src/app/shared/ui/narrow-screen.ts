import { DestroyRef, inject, PLATFORM_ID, signal, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * The widths below which a screen is narrow: `sm` the phone line, `md` where
 * three-column layouts fold, `lg` for screens with many columns. Range queries,
 * so they match the breakpoints in styles.css to the pixel.
 */
export const NARROW_SCREEN_QUERIES = {
  sm: '(width < 40rem)',
  md: '(width < 49.5rem)',
  lg: '(width < 65.75rem)',
} as const;

export type NarrowBreakpoint = keyof typeof NARROW_SCREEN_QUERIES;

/**
 * Whether the window is narrower than a breakpoint, for a screen whose two
 * shapes are different markup. Only where the first paint does not depend on
 * it (client-rendered, or an overlay a tap opens): the server answers "not
 * narrow".
 */
export function injectNarrowScreen(
  breakpoint: NarrowBreakpoint = 'md',
): Signal<boolean> {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const narrow = signal(false);
  // A test environment may have no matchMedia.
  if (!isBrowser || typeof window.matchMedia !== 'function') {
    return narrow.asReadonly();
  }

  const list = window.matchMedia(NARROW_SCREEN_QUERIES[breakpoint]);
  const update = () => narrow.set(list.matches);
  update();
  list.addEventListener('change', update);
  inject(DestroyRef).onDestroy(() =>
    list.removeEventListener('change', update),
  );

  return narrow.asReadonly();
}
