import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

/** How long opening and closing take, as for every disclosure. */
const DURATION_MS = 200;

const row = 'grid';

const rows = {
  open: 'grid-rows-[1fr]',
  closed: 'grid-rows-[0fr]',
} as const;

const rowMotion = 'transition-[grid-template-rows] duration-200 ease-out';

const content = 'min-h-0 overflow-hidden';

const contents = {
  open: 'visible',
  closed: 'invisible',
} as const;

const contentMotion = 'transition-[visibility] duration-200';

/** Widths at which nothing is folded. Literal classes, so Tailwind sees them. */
const rowsOpenAt = {
  md: 'md:grid-rows-[1fr]',
} as const;
const contentsOpenAt = {
  md: 'md:visible',
} as const;

/**
 * The rest of a list past its first few, opening in place under them, asked
 * for by a ShowMoreToggle. A grid row from `0fr` to `1fr`, since a height
 * cannot animate to `auto`. The transition is armed only while a change of
 * `open` plays out, so a row that starts open, or is held open by width, does
 * not play its opening on load or on a resize.
 *
 * Folded content is `invisible` as well as clipped, so it leaves the tab
 * order; visibility transitions too, so it stays visible while closing.
 */
@Component({
  selector: 'app-collapsible',
  host: { '[class]': 'rowClass()' },
  template: `<div [class]="contentClass()"><ng-content /></div>`,
})
export class Collapsible {
  readonly open = input(false);
  /** A width from which the rest is always shown. */
  readonly openAt = input<keyof typeof rowsOpenAt>();

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
      // A hair past the movement: disarming on its last frame can cut it.
      timer = setTimeout(() => this.animated.set(false), DURATION_MS + 50);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  private readonly state = computed(() => (this.open() ? 'open' : 'closed'));

  protected readonly rowClass = computed(() => {
    const at = this.openAt();
    return `${row} ${rows[this.state()]} ${this.animated() ? rowMotion : ''}
            ${at ? rowsOpenAt[at] : ''}`;
  });

  protected readonly contentClass = computed(() => {
    const at = this.openAt();
    return `${content} ${contents[this.state()]}
            ${this.animated() ? contentMotion : ''}
            ${at ? contentsOpenAt[at] : ''}`;
  });
}
