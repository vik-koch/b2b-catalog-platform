import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, vi } from 'vitest';
import { delayedLoading } from './delayed-loading';

const DELAY = 200;

function setup(platform: 'browser' | 'server' = 'browser') {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: platform }],
  });
  const loading = signal(false);
  const visible = TestBed.runInInjectionContext(() =>
    delayedLoading(loading, DELAY),
  );
  // The effect that watches `loading` runs on the first change detection.
  const flush = () => TestBed.tick();
  return { loading, visible, flush };
}

describe('delayedLoading', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays hidden while the load is still within the delay', () => {
    const { loading, visible, flush } = setup();

    loading.set(true);
    flush();
    vi.advanceTimersByTime(DELAY - 1);

    expect(visible()).toBe(false);
  });

  it('appears once the load outlasts the delay', () => {
    const { loading, visible, flush } = setup();

    loading.set(true);
    flush();
    vi.advanceTimersByTime(DELAY);
    flush();

    expect(visible()).toBe(true);
  });

  // The point of the whole helper: a fast load must never flash a skeleton.
  it('never appears when the load finishes inside the delay', () => {
    const { loading, visible, flush } = setup();

    loading.set(true);
    flush();
    vi.advanceTimersByTime(DELAY / 2);
    loading.set(false);
    flush();
    vi.advanceTimersByTime(DELAY * 2);
    flush();

    expect(visible()).toBe(false);
  });

  it('disappears immediately when the load ends', () => {
    const { loading, visible, flush } = setup();

    loading.set(true);
    flush();
    vi.advanceTimersByTime(DELAY);
    flush();
    expect(visible()).toBe(true);

    loading.set(false);
    flush();

    expect(visible()).toBe(false);
  });

  // SSR waits for data before serialising, so the rendered HTML has content.
  it('never appears on the server', () => {
    const { loading, visible, flush } = setup('server');

    loading.set(true);
    flush();
    vi.advanceTimersByTime(DELAY * 5);
    flush();

    expect(visible()).toBe(false);
  });
});
