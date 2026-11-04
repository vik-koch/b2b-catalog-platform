import {
  afterNextRender,
  DOCUMENT,
  effect,
  inject,
  Injector,
  Signal,
} from '@angular/core';

/**
 * Scrolls a deep-linked row into view once, on the first render with the list
 * loaded; a later toggle must not move the page under the click. `id` is a
 * signal, as the router binds a query parameter after construction. Tested in
 * web-e2e: jsdom has no `scrollIntoView`.
 */
export function useRowAnchor(
  id: Signal<string | null>,
  loaded: Signal<boolean>,
): void {
  const document = inject(DOCUMENT);
  const injector = inject(Injector);

  let armed = true;
  effect(
    () => {
      const target = id();
      if (!armed || !loaded()) return;
      armed = false;
      if (!target) return;
      // The DOM catches up with the data on the next render.
      afterNextRender(
        () =>
          document.getElementById(target)?.scrollIntoView({ block: 'start' }),
        { injector },
      );
    },
    { injector },
  );
}
