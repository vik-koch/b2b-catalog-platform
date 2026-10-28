import { computed, Directive, input } from '@angular/core';

/** Hover wins over open: Tailwind orders the variant after the plain utility. */
const base = 'transition-colors has-[ui-disclosure-toggle:hover]:border-accent';

const borders = {
  open: 'border-secondary',
  closed: 'border-edge-strong',
} as const;

/**
 * The colour of the box a DisclosureToggle opens; the box's shape stays the
 * host's. Accent while the toggle is under the pointer, secondary while open,
 * the strong edge otherwise.
 *
 *   <div uiDisclosureFrame [open]="open()" class="rounded-md border">…</div>
 */
@Directive({
  selector: '[uiDisclosureFrame]',
  host: { '[class]': 'classes()' },
})
export class DisclosureFrame {
  readonly open = input(false);

  protected readonly classes = computed(
    () => `${base} ${borders[this.open() ? 'open' : 'closed']}`,
  );
}
