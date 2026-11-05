import { MediaReferences } from './media-references';
import { runMediaPrune, type PruneResult } from './prune-media';

interface MediaPruneScheduleOptions {
  connectionString: string;
  sources: MediaReferences;
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

/** Returns a stop function, for tests. A slow sweep never overlaps the next,
 * and a failed one is logged, never thrown into the server it runs in. */
export function scheduleMediaPrune(
  options: MediaPruneScheduleOptions,
): () => void {
  const {
    connectionString,
    sources,
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
        sources,
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
