import {
  computed,
  DestroyRef,
  effect,
  inject,
  Signal,
  signal,
} from '@angular/core';
import { adminText } from '../config/admin-text';
import { AdminText } from '../config/admin-text.type';
import { delayedLoading } from '../core/delayed-loading';
import { EditModeService } from './edit-mode.service';

/** What a storefront page needs to render itself without popping. */
export interface EditAwareContent<T> {
  /** True once the content may be shown: its data is on hand and the visitor's
   * edit affordances are decided. */
  readonly ready: Signal<boolean>;
  /** The edit-mode wording for this page's section, or null when there are no
   * affordances to draw. Non-null implies everything they need has arrived —
   * including the content, so a control never precedes what it acts on. */
  readonly controls: Signal<T | null>;
  /** The placeholder flag, delayed so a quick load never flashes it. */
  readonly showSkeleton: Signal<boolean>;
}

/**
 * The gate every storefront page shares: hold the content until both its own
 * data and the visitor's role are known, then draw the page and its edit
 * affordances in the same frame.
 *
 * The two arrive on different schedules — the catalogue is one request, the
 * session another, and the admin wording a third — so a page that renders on
 * its data alone paints for a visitor and then sprouts admin controls a moment
 * later, shifting everything under the pointer. Waiting costs nothing for the
 * far commoner case: the session request is issued at bootstrap, so by the time
 * any page's data is back it has almost always answered too.
 *
 * Must be called in an injection context (a field initialiser or a
 * constructor). The caller's template is expected to check its error branch
 * before `ready` — a failed load is never "ready", so the skeleton would
 * otherwise sit under the error message forever.
 */
export function editAwareContent<K extends keyof AdminText>(options: {
  /** True once this page's own data is on hand — loaded, not merely non-empty. */
  ready: Signal<boolean>;
  /** Which slice of the admin wording this page's affordances read. */
  section: K;
  /**
   * Anything else the affordances wait on, consulted only while edit mode is
   * on — the category grid holds its controls until the "Deleted" overlay has
   * loaded, so entering edit mode reveals everything at once. Whatever produces
   * it must not itself wait on `ready`, or the two deadlock.
   */
  alsoWaitFor?: Signal<boolean>;
}): EditAwareContent<AdminText[K]> {
  const editMode = inject(EditModeService);
  // Tells the floating toggle there is something on this page to reveal, for
  // as long as this surface is on it.
  inject(DestroyRef).onDestroy(editMode.registerEditable());

  /** Whether the affordances are decided: the session has answered, and
   * anything edit mode itself waits on has arrived. */
  const decided = computed(
    () =>
      editMode.settled() &&
      (!editMode.enabled() || (options.alsoWaitFor?.() ?? true)),
  );

  // Once a page has been drawn it stays drawn. `decided` goes back to "not
  // yet" every time edit mode is switched on, because whatever it waits for is
  // fetched afresh — and without this latch that would tear the whole listing
  // down and rebuild it under the pointer to reveal a pencil. Waiting is for
  // the first paint, where there is nothing on screen to disturb.
  const drawn = signal(false);
  effect(() => {
    if (options.ready() && decided()) drawn.set(true);
  });

  const ready = computed(() => options.ready() && (decided() || drawn()));
  // Still gated on `decided`, so switching edit mode on reveals the whole set
  // of affordances at once rather than a pencil now and an overlay later.
  const controls = computed(() =>
    ready() && decided() && editMode.enabled()
      ? (adminText()?.[options.section] ?? null)
      : null,
  );

  return {
    ready,
    controls,
    showSkeleton: delayedLoading(computed(() => !ready())),
  };
}
