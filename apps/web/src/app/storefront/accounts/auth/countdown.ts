import {
  afterNextRender,
  DestroyRef,
  inject,
  signal,
  type WritableSignal,
} from '@angular/core';

/** A wait as minutes and seconds: `0:42`, `27:05`. */
export function formatWait(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * `Date.now()`, ticking every second in the browser only: an interval on the
 * server would keep the render from settling. Writable, so a caller can sync it
 * when it restarts a countdown. Needs an injection context.
 */
export function tickingNow(): WritableSignal<number> {
  const now = signal(Date.now());
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const tick = setInterval(() => now.set(Date.now()), 1000);
    destroyRef.onDestroy(() => clearInterval(tick));
  });
  return now;
}
