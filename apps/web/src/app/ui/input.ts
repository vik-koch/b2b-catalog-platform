import { computed, Directive, ElementRef, inject, input } from '@angular/core';

/*
 * Focus is the app-wide outline from styles.css and nothing of its own — not a
 * border recolor, which at 1px is not a perceivable focus indicator (WCAG
 * 2.4.7 / 1.4.11), and no inset offset either: a field that ringed itself
 * differently from the button beside it is the inconsistency this replaced.
 */
const base =
  'block rounded-md border border-border-strong bg-white disabled:cursor-not-allowed disabled:bg-stone-100';

const sizes = {
  md: 'px-3 py-2',
  /** Dense fields: editor side panels, table cells, inline forms. */
  sm: 'px-2 py-1.5 text-sm',
} as const;

/*
 * What a <select> needs on top, decided here rather than repeated at each
 * picker: the platform arrow is dropped so the control looks the same on every
 * browser, and the right padding reserves exactly the room SelectField's
 * chevron is drawn in. Keeping the two in one place is the point — they only
 * ever change together, and drifting apart is what makes a chevron sit on top
 * of a long option label. `pr-*` beats the size's `px-*` on Tailwind's own
 * ordering, so no call site has to restate its padding.
 */
const selectExtras = 'appearance-none pr-9';

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
 *
 * A <select> additionally needs SelectField around it to get its chevron back:
 *
 *   <app-select-field class="max-w-72">
 *     <select appInput class="w-full">…</select>
 *   </app-select-field>
 */
@Directive({
  selector: '[appInput]',
  host: { '[class]': 'classes()' },
})
export class Input {
  /** Read once: an element does not change tag. Works under SSR too — the
   * server's DOM implementation reports `tagName` just as the browser does. */
  private readonly isSelect =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName ===
    'SELECT';

  size = input<keyof typeof sizes>('md');

  protected classes = computed(
    () =>
      `${base} ${sizes[this.size()]}${this.isSelect ? ` ${selectExtras}` : ''}`,
  );
}
