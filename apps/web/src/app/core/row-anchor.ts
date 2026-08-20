import {
  afterNextRender,
  DOCUMENT,
  effect,
  inject,
  Injector,
  Signal,
} from '@angular/core';

/**
 * Scrolls one row of a list into view, once, when the page arrives deep-linked
 * at it.
 *
 * The two attribute screens hand rows to each other by query parameter, and a
 * link that only expands its row leaves the reader at the top of an
 * alphabetical list whose interesting part is far below the fold.
 *
 * Both arguments are signals, and `id` has to be: the router binds a query
 * parameter to its input *after* the component is constructed, so reading it
 * here directly would only ever see the default.
 *
 * Arrival only, and "arrival" is the first render that has the list to scroll
 * within — whatever the id is by then decides it, for good. A later toggle is a
 * click on a row the admin is already looking at, and pulling the page around
 * under that click would be the worse bug.
 *
 * Verified in `web-e2e`, not in a unit test: jsdom implements no
 * `scrollIntoView`, and TestBed does not flush after-render hooks anyway, so a
 * unit test would assert nothing here even where it appeared to pass.
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
      // Rendered after this tick, not during it: the list has the data now, the
      // DOM catches up next.
      afterNextRender(
        () =>
          document.getElementById(target)?.scrollIntoView({ block: 'start' }),
        { injector },
      );
    },
    { injector },
  );
}
