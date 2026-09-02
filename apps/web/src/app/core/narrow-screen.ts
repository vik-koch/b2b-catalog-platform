import { DestroyRef, inject, PLATFORM_ID, signal, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * The widths below which a screen is treated as narrow.
 *
 * `md` (49.5rem) is the everyday line: it is where the app's other three-column
 * layouts fold, where a table of six or seven columns is already unreadable,
 * and where the product editor's two grids of typed cells give up on being
 * tables at all. `lg` (65.75rem) is for the few screens carrying more
 * columns than that — the customer list's nine — which run out of room a whole
 * breakpoint earlier.
 *
 * Written as range queries so they cannot drift from the breakpoints in
 * styles.css by the fraction of a pixel a `max-width` has to subtract.
 */
export const NARROW_SCREEN_QUERIES = {
  md: '(width < 49.5rem)',
  lg: '(width < 65.75rem)',
} as const;

export type NarrowBreakpoint = keyof typeof NARROW_SCREEN_QUERIES;

/**
 * Whether the window is narrower than the given breakpoint, as a signal, for
 * the screens whose two shapes are different *markup* rather than one set of
 * elements under two stylesheets — an admin grid is a table on a desktop and a
 * list of records on a phone, and rendering both to hide one would double the
 * rows.
 *
 * Only safe where the page is client-rendered, which the admin panel is: the
 * server has no window to measure and answers "not narrow", so an SSR page
 * asking this would render the desktop shape and rearrange itself on boot.
 */
export function injectNarrowScreen(
  breakpoint: NarrowBreakpoint = 'md',
): Signal<boolean> {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const narrow = signal(false);
  // Guarded rather than assumed: a test environment may have no matchMedia,
  // and a media query is not worth a broken component.
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
