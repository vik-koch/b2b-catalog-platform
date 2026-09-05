import { Component, input, output } from '@angular/core';
import { Icon } from './icons/icon';

/**
 * The edge of the box a disclosure lives in, as its four hosts draw it — the
 * frame is theirs (each is rounded, bordered or not at a different width), the
 * colour of it is this.
 *
 * The same three states the search field wears, and for the same reason: the
 * border is the only thing either control has to say it is being used.
 * Accent while the lid is under the pointer, secondary while it is open, and
 * the ordinary strong edge otherwise. Hover wins over open — it answers a
 * pointer that is on the control right now, and Tailwind orders the variant
 * after the plain utility, so the two may be given together.
 *
 *   <div [class]="frame + ' ' + disclosureBorder(open())">
 */
export const DISCLOSURE_FRAME =
  'transition-colors has-[app-disclosure-toggle:hover]:border-accent';

export function disclosureBorder(open: boolean): string {
  return open ? 'border-secondary' : 'border-border-strong';
}

/**
 * The button that opens a panel of controls in place — the storefront's filter
 * facets, and the admin grid's filters and sort on a narrow screen.
 *
 * Shared because the two are the same control: a name, how many choices are in
 * effect, and a chevron that turns. They had drifted into two spellings of it,
 * and the count was drawn differently in each.
 *
 * It brings no border of its own. The two hosts frame it differently — the
 * facet panel's toggle becomes a heading at column width, while the grid's is
 * the lid of the box it opens — and a border here would have to be undone by
 * both.
 */
@Component({
  selector: 'app-disclosure-toggle',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium transition-colors select-none hover:text-accent"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId()"
      (click)="toggled.emit()"
    >
      <span>
        {{ label() }}
        @if (count()) {
          <span class="ml-1 text-accent">{{ countLabel() }}</span>
        }
      </span>
      <!-- The chevron answers the pointer with the label it belongs to: the
           button recolours itself on hover, and a glyph carrying a colour of
           its own was the one part of the control that did not follow. Keyed
           on the button rather than on a group class, so nothing has to be
           said at the two call sites. -->
      <app-icon
        name="chevron-down"
        class="h-4 w-4 shrink-0 text-subtle transition-[transform,color] [button:hover_&]:text-accent"
        [class.rotate-180]="open()"
      />
    </button>
  `,
})
export class DisclosureToggle {
  readonly label = input.required<string>();
  /** How many choices are in effect; zero shows nothing. */
  readonly count = input(0);
  /** The count as the deployment words it — "(3)" everywhere so far. */
  readonly countLabel = input('');
  readonly open = input(false);
  /** The panel this opens, for `aria-controls`. */
  readonly panelId = input.required<string>();

  readonly toggled = output<void>();
}
