import { computed, signal } from '@angular/core';
import { WorkCounts } from '@b2b-catalog-platform/shared/core/work';

/** WorkService for component specs: the counts as given, no network. */
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
