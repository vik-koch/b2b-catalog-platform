import { computed, Directive, input } from '@angular/core';

const base = `inline-flex cursor-pointer items-center justify-center
              rounded-full bg-white text-ink-subtle shadow-sm ring-1 ring-edge
              transition-colors select-none
              hover:text-accent
              active:text-primary-press
              disabled:cursor-not-allowed`;

/** `md` beside content, `sm` on a grid tile. */
const sizes = {
  sm: 'p-1',
  md: 'p-1.5',
} as const;

/**
 * A control laid over content (a tile, a photo, a page corner): a disc with
 * a surface of its own and a size that stays put on a phone, unlike
 * IconButton. The caller sizes the glyph.
 */
@Directive({
  selector: '[appDiscButton]',
  host: { '[class]': 'classes()' },
})
export class DiscButton {
  readonly size = input<keyof typeof sizes>('md');

  protected readonly classes = computed(() => `${base} ${sizes[this.size()]}`);
}
