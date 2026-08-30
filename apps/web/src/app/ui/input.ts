import { computed, Directive, ElementRef, inject, input } from '@angular/core';

/*
 * Focus is the app-wide outline from styles.css and nothing of its own — not a
 * border recolor, which at 1px is not a perceivable focus indicator (WCAG
 * 2.4.7 / 1.4.11), and no inset offset either: a field that ringed itself
 * differently from the button beside it is the inconsistency this replaced.
 *
 * A refused field, on the other hand, does recolor its border: the message
 * under it is easy to miss on a long form, and the border is not the only
 * indicator — it is the field the message already names. Keyed on the presence
 * of aria-invalid, which every field binds as `… || null`, so a valid one
 * carries no attribute and no red.
 */
const base =
  'block rounded-md border border-border-strong bg-white [&[aria-invalid]]:border-red-600 disabled:cursor-not-allowed disabled:bg-stone-100';

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

/*
 * What a <textarea> needs on top, for the same reason: dragged taller is the
 * only useful direction. Wider would push it out of the column it sits in, and
 * shorter than the line it starts as leaves a field with nothing to read in
 * it — the corner could be dragged until the note it holds was a slot. The
 * floor is that one line plus the padding and borders of the size it is drawn
 * at, so it follows the size rather than restating it.
 */
const textareaExtras = {
  md: 'resize-y min-h-[calc(1lh+1rem+2px)]',
  sm: 'resize-y min-h-[calc(1lh+0.75rem+2px)]',
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
  private readonly tag =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName;

  size = input<keyof typeof sizes>('md');

  protected classes = computed(() => {
    const size = this.size();
    const extras =
      this.tag === 'SELECT'
        ? selectExtras
        : this.tag === 'TEXTAREA'
          ? textareaExtras[size]
          : '';
    return `${base} ${sizes[size]}${extras ? ` ${extras}` : ''}`;
  });
}
