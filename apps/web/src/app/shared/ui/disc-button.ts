import { computed, Directive, input } from '@angular/core';

/** How much room the glyph gets on its disc. `md` beside content, `sm` on a
 * grid tile, where the disc sits on the picture rather than next to it. */
const sizes = {
  sm: 'p-1',
  md: 'p-1.5',
} as const;

/**
 * The edit-mode affordance: a disc that lifts off whatever it sits on.
 *
 * Its own directive rather than a shape of IconButton, because the two are not
 * one control with two skins. This one is laid *over* content — a tile, a
 * photo, a page corner — where it needs a surface of its own to be legible and
 * a size that stays put; IconButton sits inside a line of content and grows on
 * a touch screen. Sharing a directive meant one of those rules always applied
 * to the wrong control, and the discs came out fat on a phone.
 *
 * The glyph is sized by the caller here: a disc on a tile carries a smaller
 * one than a disc beside a heading (see EditActions, the only caller).
 */
@Directive({
  selector: '[appDiscButton]',
  host: { '[class]': 'classes()' },
})
export class DiscButton {
  size = input<keyof typeof sizes>('md');

  // See Button for the cursor and focus-outline reasoning.
  protected classes = computed(
    () =>
      `inline-flex cursor-pointer items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-border transition-colors select-none disabled:cursor-not-allowed ${
        sizes[this.size()]
      } text-muted hover:text-accent active:text-primary-deep`,
  );
}
