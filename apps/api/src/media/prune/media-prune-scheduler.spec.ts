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
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sweeps once after the startup delay, then on each interval', async () => {
    const run = jest.fn().mockResolvedValue(emptyResult);
    const stop = scheduleMediaPrune({ ...baseOptions, run });

    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it('runs no more sweeps after being stopped', async () => {
    const run = jest.fn().mockResolvedValue(emptyResult);
    const stop = scheduleMediaPrune({ ...baseOptions, run });
    stop();
    await jest.advanceTimersByTimeAsync(50_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('swallows a failed sweep so the timer survives', async () => {
    const run = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(emptyResult);
    const log = jest.fn();
    const stop = scheduleMediaPrune({ ...baseOptions, run, log });

    await jest.advanceTimersByTimeAsync(1000);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('media prune failed: db down'),
    );
    // The next interval still fires despite the earlier rejection.
    await jest.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('does not overlap a slow sweep with the next tick', async () => {
    let resolve: (v: PruneResult) => void = () => undefined;
    const run = jest.fn().mockImplementation(
      () =>
        new Promise<PruneResult>((r) => {
          resolve = r;
        }),
    );
    const stop = scheduleMediaPrune({ ...baseOptions, run });

    await jest.advanceTimersByTimeAsync(1000); // startup run begins, stays pending
    await jest.advanceTimersByTimeAsync(10_000); // an interval tick lands
    expect(run).toHaveBeenCalledTimes(1); // re-entrancy guard blocks the second

    resolve(emptyResult);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10_000); // next tick runs now it is free
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });
});
