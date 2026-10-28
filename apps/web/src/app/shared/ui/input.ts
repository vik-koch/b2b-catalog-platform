import { computed, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * No focus classes: the app's one focus rule in styles.css recolours the edge
 * the field already has. A refused field keeps a red edge while unfocused,
 * keyed on the presence of `aria-invalid`, which a valid field does not carry.
 * Hover excludes a refused field and outranks both other edges on specificity,
 * not on the order Tailwind emits them in; focus still wins, being unlayered.
 */
const base = `block rounded-md border border-edge-strong bg-white transition-colors not-aria-invalid:hover:border-accent [&[aria-invalid]]:border-danger disabled:cursor-not-allowed disabled:bg-surface`;

const sizes = {
  md: 'px-3 py-2',
  /** Dense fields: editor side panels, table cells, inline forms. */
  sm: 'px-2 py-1.5 text-sm',
} as const;

/**
 * A <select> drops the platform arrow, so it looks the same everywhere, and
 * reserves the room SelectInput draws its chevron in. The two change together.
 */
const selectExtras = 'appearance-none pr-9';

/**
 * A <textarea> grows only downwards, and never below its one line plus the
 * padding and borders of its size.
 */
const textareaExtras = {
  md: 'resize-y min-h-[calc(1lh+1rem+2px)]',
  sm: 'resize-y min-h-[calc(1lh+0.75rem+2px)]',
} as const;

/**
 * The field look on an <input>, <textarea> or <select>. Width is the caller's
 * (`w-full` in a stacked form, intrinsic elsewhere), as are modifiers such as
 * `font-mono`. A <select> also needs SelectInput around it for its chevron.
 *
 *   <input appInput class="w-full" [value]="…" />
 *   <textarea appInput size="sm" class="w-full font-mono"></textarea>
 *   <app-select-input class="max-w-72">
 *     <select appInput class="w-full">…</select>
 *   </app-select-input>
 */
@Directive({
  selector: '[appInput]',
  host: { '[class]': 'classes()' },
})
export class Input {
  /** Read once: an element does not change tag, on the server either. */
  private readonly tag =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName;

  readonly size = input<keyof typeof sizes>('md');

  protected readonly classes = computed(
    () => `${base} ${sizes[this.size()]} ${this.extras()}`,
  );

  private extras(): string {
    if (this.tag === 'SELECT') return selectExtras;
    if (this.tag === 'TEXTAREA') return textareaExtras[this.size()];
    return '';
  }
}
