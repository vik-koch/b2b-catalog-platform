import {
  DestroyRef,
  effect,
  inject,
  Signal,
  signal,
  untracked,
} from '@angular/core';

/**
 * Keeps a panel in the document for the length of its exit animation.
 *
 * An element the template has already removed has nothing left to animate, so
 * a `@if` on the open state alone can only ever animate an arrival. This
 * follows the state on the way in and trails it on the way out: render on
 * `shown`, and pick the entry or exit animation off `leaving`.
 *
 * `leaveMs` must match the exit animation's duration in styles.css, and that
 * animation must hold its last frame — the element is still there while it
 * runs.
 *
 * Call it from an injection context.
 */
export function withExitAnimation(
  open: Signal<boolean>,
  leaveMs: number,
): { shown: Signal<boolean>; leaving: Signal<boolean> } {
  const shown = signal(false);
  const leaving = signal(false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  effect(() => {
    const isOpen = open();
    clearTimeout(timer);

    // Untracked throughout: these two are this effect's own output, and
    // reading them as inputs would have it re-run on what it just wrote.
    // Reopening mid-exit therefore lands back on the entry animation rather
    // than stacking a second panel behind the first.
    if (isOpen) {
      untracked(() => {
        leaving.set(false);
        shown.set(true);
      });
      return;
    }
    if (!untracked(shown)) return;
    untracked(() => leaving.set(true));
    timer = setTimeout(() => {
      shown.set(false);
      leaving.set(false);
    }, leaveMs);
  });

  return { shown, leaving };
}
