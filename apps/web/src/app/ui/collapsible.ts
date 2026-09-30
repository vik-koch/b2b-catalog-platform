import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

/** How long opening and closing take — the app's other disclosures' figure. */
const DURATION_MS = 200;

/**
 * Widths at which nothing is folded, so the rest stands open whatever the
 * toggle says. Literal classes, so Tailwind sees them.
 */
const OPEN_AT = {
  md: 'md:grid-rows-[1fr]',
} as const;
const VISIBLE_AT = {
  md: 'md:visible',
} as const;

/**
 * The rest of a list past its first few, opening in place under them: the
 * facet values past the cutoff, a chip's subcategories, the gallery's second
 * row of thumbnails. One movement for all of them, paired with ShowMoreToggle
 * as the one control that asks for it.
 *
 * A grid row going from `0fr` to `1fr`, since a height cannot be animated to
 * `auto`; the first few stay outside it, so they never move. The transition is
 * armed only while a change of `open` plays out, so a row that starts open
 * (a shared link ticking a value past the cutoff) or is held open by width
 * simply is, rather than playing its opening on load or on a resize.
 *
 * Folded content is `invisible` as well as clipped, so its links and boxes
 * leave the tab order with it; visibility is transitioned too, which keeps it
 * visible until a closing movement has finished.
 */
@Component({
  selector: 'app-collapsible',
  host: { '[class]': 'rowClass()' },
  template: `<div [class]="contentClass()"><ng-content /></div>`,
})
export class Collapsible {
  readonly open = input(false);
  /** A width from which the rest is always shown. */
  readonly openAt = input<keyof typeof OPEN_AT>();

  private readonly animated = signal(false);

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    effect(() => {
      this.open();
      if (first) {
        first = false;
        return;
      }
      this.animated.set(true);
      clearTimeout(timer);
      // A hair past the movement: disarming on the exact frame it ends can
      // catch the last one.
      timer = setTimeout(() => this.animated.set(false), DURATION_MS + 50);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  protected readonly rowClass = computed(() => {
    const at = this.openAt();
    const move = this.animated()
      ? ' transition-[grid-template-rows] duration-200 ease-out'
      : '';
    const rows = this.open() ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]';
    return `grid${move} ${rows}${at ? ` ${OPEN_AT[at]}` : ''}`;
  });

  protected readonly contentClass = computed(() => {
    const at = this.openAt();
    const move = this.animated() ? ' transition-[visibility] duration-200' : '';
    const shown = this.open() ? 'visible' : 'invisible';
    return `min-h-0 overflow-hidden${move} ${shown}${at ? ` ${VISIBLE_AT[at]}` : ''}`;
  });
}
