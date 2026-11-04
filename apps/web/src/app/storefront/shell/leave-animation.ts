import {
  DestroyRef,
  effect,
  inject,
  Signal,
  signal,
  untracked,
} from '@angular/core';

/** The exit animations' length in styles.css, which hold their last frame. */
const EXIT_MS = 150;

/**
 * Keeps a panel in the document through its exit animation, which a removed
 * element cannot run: render on `shown`, animate off `leaving`. Call in an
 * injection context.
 */
export function withExitAnimation(
  open: Signal<boolean>,
  leaveMs = EXIT_MS,
): { shown: Signal<boolean>; leaving: Signal<boolean> } {
  const shown = signal(false);
  const leaving = signal(false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  effect(() => {
    const isOpen = open();
    clearTimeout(timer);

    // Untracked: its own output, so a reopening mid-exit lands back on the
    // entry rather than stacking a second panel.
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
