import { linkedSignal, Resource, Signal } from '@angular/core';

/**
 * A resource's value held through its reloads, so a new sort or page does not
 * blink the listing out. An error clears it, as a stale grid would claim the
 * failed request succeeded.
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
      // `value()` throws on an errored resource.
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
