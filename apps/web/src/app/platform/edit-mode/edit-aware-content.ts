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
import { delayedLoading } from '../delayed-loading';
import { EditModeService } from './edit-mode.service';

interface EditAwareContent<T> {
  /** The data is here and the visitor's edit affordances are decided. */
  readonly ready: Signal<boolean>;
  /** The section's edit wording, or null for no affordances; never before
   * the content they act on. */
  readonly controls: Signal<T | null>;
  /** The placeholder flag, delayed so a quick load never flashes it. */
  readonly showSkeleton: Signal<boolean>;
}

/**
 * Holds a storefront page until its data and the visitor's role are both
 * known, so admin controls never sprout under the pointer; the session is
 * asked at bootstrap, so the wait is rarely felt. A template checks its error
 * branch before `ready`, which a failed load never is. Call in an injection
 * context.
 */
export function editAwareContent<K extends keyof AdminText>(options: {
  /** Loaded, not merely non-empty. */
  ready: Signal<boolean>;
  /** Which slice of the admin wording this page's affordances read. */
  section: K;
  /** What else the affordances wait on in edit mode, such as the grid's
   * "Deleted" overlay. Must not wait on `ready`, or the two deadlock. */
  alsoWaitFor?: Signal<boolean>;
}): EditAwareContent<AdminText[K]> {
  const editMode = inject(EditModeService);
  // Tells the toggle there is something here to reveal.
  inject(DestroyRef).onDestroy(editMode.registerEditable());

  /** The session has answered and what edit mode waits on has arrived. */
  const decided = computed(
    () =>
      editMode.settled() &&
      (!editMode.enabled() || (options.alsoWaitFor?.() ?? true)),
  );

  // Drawn once, drawn for good: switching edit mode on refetches what
  // `decided` waits for, and must not rebuild the listing to show a pencil.
  const drawn = signal(false);
  effect(() => {
    if (options.ready() && decided()) drawn.set(true);
  });

  const ready = computed(() => options.ready() && (decided() || drawn()));
  // Still on `decided`, so the affordances arrive as one set.
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
