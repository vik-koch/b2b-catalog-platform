import { runMediaPrune, type PruneResult } from './prune-media';

export interface MediaPruneScheduleOptions {
  connectionString: string;
  mediaRoot: string;
  graceMs: number;
  /** How often the background sweep runs. */
  intervalMs: number;
  /** Delay before the first sweep, so a just-booted server serves traffic
   * before spending I/O on maintenance. */
  startupDelayMs: number;
  dryRun?: boolean;
  log?: (message: string) => void;
  /** Injected only by tests; production uses the real sweep. */
  run?: typeof runMediaPrune;
}

/**
 * Start the in-process media prune. Returns a stop function (used by tests; the
 * server keeps it running for its whole lifetime). Runs are serialized by a
 * re-entrancy guard, so a slow sweep can never overlap the next tick, and every
 * run's errors are swallowed — a transient DB blip must not crash the server the
 * timer lives in. Timers are unref'd so the schedule never keeps the process
 * alive on its own.
 */
export function scheduleMediaPrune(
  options: MediaPruneScheduleOptions,
): () => void {
  const {
    connectionString,
    mediaRoot,
    graceMs,
    intervalMs,
    startupDelayMs,
    dryRun = false,
    log,
    run = runMediaPrune,
  } = options;

  let running = false;

  const sweep = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      const result = await run({
        connectionString,
        mediaRoot,
        graceMs,
        dryRun,
        log,
      });
      log?.(summarize(result, dryRun));
    } catch (error) {
      log?.(`media prune failed: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };

  const startupTimer = setTimeout(() => void sweep(), startupDelayMs);
  const intervalTimer = setInterval(() => void sweep(), intervalMs);
  startupTimer.unref?.();
  intervalTimer.unref?.();

  return () => {
    clearTimeout(startupTimer);
    clearInterval(intervalTimer);
  };
}

function summarize(result: PruneResult, dryRun: boolean): string {
  return (
    `media prune complete: scanned ${result.scanned}, ` +
    `deleted ${result.deleted}, kept ${result.kept}, ` +
    `skipped-young ${result.skippedYoung}` +
    (dryRun ? ' (dry run)' : '')
  );
}
