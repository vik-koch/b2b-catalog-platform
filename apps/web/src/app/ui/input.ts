import { computed, Directive, input } from '@angular/core';

/*
 * Focus is a real outline rather than a border-color change: a 1px border
 * recolor is not a perceivable focus indicator (WCAG 2.4.7 / 1.4.11). An
 * outline needs no ring-offset color, so it reads correctly on the white page
 * and on the stone-100 blocks alike.
 */
const base =
  'block rounded-md border border-stone-300 bg-white focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-primary disabled:cursor-not-allowed disabled:bg-stone-100';

const sizes = {
  md: 'px-3 py-2',
  /** Dense fields: editor side panels, table cells, inline forms. */
  sm: 'px-2 py-1.5 text-sm',
} as const;

/**
 * Styling-only form-field directive (shadcn-style owned primitive), the input
 * counterpart to Button. Applies to <input>, <textarea> and <select> so every
 * field in the app shares one look, one focus treatment and one disabled state.
 *
 * Width is deliberately not baked in — fields are `w-full` in stacked forms and
 * intrinsic elsewhere — so call sites add their own width and any modifier
 * (`font-mono`, `text-right`) as ordinary classes.
 *
 *   <input appInput class="w-full" [value]="…" />
 *   <textarea appInput size="sm" class="w-full font-mono"></textarea>
 */
@Directive({
  selector: '[appInput]',
  host: { '[class]': 'classes()' },
})
export class Input {
  size = input<keyof typeof sizes>('md');

  protected classes = computed(() => `${base} ${sizes[this.size()]}`);
}
