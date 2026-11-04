import { scheduleMediaPrune } from './media-prune-scheduler';
import type { PruneResult } from './prune-media';

const emptyResult: PruneResult = {
  scanned: 0,
  deleted: 0,
  kept: 0,
  skippedYoung: 0,
};

const baseOptions = {
  connectionString: 'postgres://ignored',
  mediaRoot: '/media',
  graceMs: 1000,
  intervalMs: 10_000,
  startupDelayMs: 1000,
};

describe('scheduleMediaPrune', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sweeps once after the startup delay, then on each interval', async () => {
    const run = vi.fn().mockResolvedValue(emptyResult);
    const stop = scheduleMediaPrune({ ...baseOptions, run });

    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it('runs no more sweeps after being stopped', async () => {
    const run = vi.fn().mockResolvedValue(emptyResult);
    const stop = scheduleMediaPrune({ ...baseOptions, run });
    stop();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('swallows a failed sweep so the timer survives', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(emptyResult);
    const log = vi.fn();
    const stop = scheduleMediaPrune({ ...baseOptions, run, log });

    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('media prune failed: db down'),
    );
    // The next interval still fires despite the earlier rejection.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('does not overlap a slow sweep with the next tick', async () => {
    let resolve: (v: PruneResult) => void = () => undefined;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise<PruneResult>((r) => {
          resolve = r;
        }),
    );
    const stop = scheduleMediaPrune({ ...baseOptions, run });

    await vi.advanceTimersByTimeAsync(1000); // startup run begins, stays pending
    await vi.advanceTimersByTimeAsync(10_000); // an interval tick lands
    expect(run).toHaveBeenCalledTimes(1); // re-entrancy guard blocks the second

    resolve(emptyResult);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10_000); // next tick runs now it is free
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });
});
