import { Resource, Signal, linkedSignal } from '@angular/core';

/**
 * A resource's value that survives its own reloads: while the next load is in
 * flight, the previous value stays readable instead of dropping to undefined.
 *
 * A listing re-fetches whenever its URL changes — a new sort, a new page — and
 * without this the whole rendered block unmounts for the duration of the
 * request. The load is usually too quick for the delayed skeleton to appear, so
 * what the visitor sees is the page blinking out and back rather than any
 * feedback. Holding the old value keeps the heading and the grid on screen
 * until the new ones are ready.
 *
 * An error clears it: a stale grid under an error message would claim the
 * failed request had succeeded.
 *
 *   protected readonly data = stableValue(this.products);
 */
export function stableValue<T>(resource: Resource<T>): Signal<T | undefined> {
  return linkedSignal<
    { hasValue: boolean; failed: boolean; value: T | undefined },
    T | undefined
  >({
    source: () => {
      const failed = resource.error() !== undefined;
      // `value()` throws on an errored resource, so it is only read once the
      // resource says it has one.
      const hasValue = resource.hasValue();
      return {
        hasValue,
        failed,
        value: hasValue ? resource.value() : undefined,
      };
    },
    computation: (source, previous) =>
      source.failed
        ? undefined
        : source.hasValue
          ? source.value
          : previous?.value,
  });
}
