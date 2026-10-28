import { DestroyRef, inject, signal } from '@angular/core';

/**
 * Whether a disclosure is open, and whether the change should animate. A
 * disclosure that becomes a plain column past a width would otherwise play
 * its opening on a resize, so the toggle arms the transition and it disarms
 * once the movement has had time to finish.
 */
export function disclosureState(durationMs: number) {
  const open = signal(false);
  const animated = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return {
    open: open.asReadonly(),
    /** True only for as long as a toggle's own movement lasts. */
    animated: animated.asReadonly(),
    toggle(): void {
      open.update((was) => !was);
      animated.set(true);
      clearTimeout(timer);
      // A hair past the movement: disarming on its last frame can cut it.
      timer = setTimeout(() => animated.set(false), durationMs + 50);
    },
  };
}
