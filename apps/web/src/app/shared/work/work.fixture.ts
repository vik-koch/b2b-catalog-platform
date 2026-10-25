import { computed, signal } from '@angular/core';
import { WorkCounts } from '@b2b-catalog-platform/shared';

/**
 * A WorkService stand-in for component tests: the counts as given, and no
 * network. Every screen that draws the account control pulls the real service
 * in otherwise, which would go asking the API what awaits a session the test
 * never established.
 */
export function workStub(counts: WorkCounts = {}) {
  const state = signal(counts);
  const total = computed(() =>
    Object.values(state()).reduce((sum, count) => sum + count, 0),
  );
  return {
    counts: state.asReadonly(),
    total,
    waiting: computed(() => total() > 0),
    refresh: () => Promise.resolve(),
    /** What a spec changes to watch a count clear. */
    set: state.set.bind(state),
  };
}
