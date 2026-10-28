import { computed, Directive, input } from '@angular/core';

/** Cursor, focus and selection as in Button. */
const base = `inline-flex cursor-pointer items-center justify-center
              rounded-md transition-colors select-none
              disabled:cursor-not-allowed`;

/**
 * Padding and glyph together, because they only ever change together. The
 * glyph's size travels as `--icon-size`, which Icon reads: a `[&>*]:size-*`
 * class never makes the server-rendered page's critical CSS. Roomier below
 * `sm`, where the pointer is a finger.
 */
const sizes = {
  sm: 'p-2 [--icon-size:1.25rem] sm:p-1 sm:[--icon-size:1rem]',
  md: 'p-2.5 [--icon-size:1.5rem] sm:p-1.5 sm:[--icon-size:1.25rem]',
  /**
   * Leads a record row: no side padding, so the glyph's edge is the row's
   * edge and the lines under it start on the same vertical.
   */
  lead: 'px-0 py-2 [--icon-size:1.25rem] sm:py-1 sm:[--icon-size:1rem]',
  /**
   * The finger size at every width, for a control laid out by a container
   * query rather than by the window.
   */
  touch: 'p-2 [--icon-size:1.25rem]',
} as const;

const variants = {
  /** Lighter than the text beside it: rows repeat it hundreds of times. */
  default: 'text-ink-subtle hover:text-accent active:text-primary-press',
  /** A control whose glyph already says something has been set. */
  marked: 'text-primary hover:text-accent active:text-primary-press',
  danger: 'text-ink-subtle hover:text-danger active:text-danger-press',
} as const;

/**
 * A glyph-sized control inside a line of content (a row's actions, the bin on
 * a cart line), on a <button> or an <a>. The glyph takes its size from here.
 * For a disc laid over content, DiscButton.
 *
 *   <a uiIconButton routerLink="…"><ui-icon [glyph]="pencilIcon" /></a>
 *   <button uiIconButton variant="danger" (click)="…">…</button>
 */
@Directive({
  selector: '[uiIconButton]',
  host: { '[class]': 'classes()' },
})
export class IconButton {
  readonly variant = input<keyof typeof variants>('default');
  readonly size = input<keyof typeof sizes>('sm');

  protected readonly classes = computed(
    () => `${base} ${sizes[this.size()]} ${variants[this.variant()]}`,
  );
}
