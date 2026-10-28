import { Component, input, output } from '@angular/core';
import { Icon } from '../icons/icon';
import { chevronDownIcon } from '../icons/glyphs/chevron-down';

/**
 * The button that opens a panel of controls in place: a name, how many
 * choices are in effect, and a chevron that turns. No border of its own: one
 * host makes it a heading, another the lid of its box (DisclosureFrame).
 */
@Component({
  selector: 'app-disclosure-toggle',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-2
             px-4 py-2.5 text-sm font-medium transition-colors select-none
             hover:text-accent"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId()"
      (click)="toggled.emit()"
    >
      <!-- A glyph may lead the name; projected, so this names none. -->
      <span class="flex items-center gap-2">
        <ng-content select="[disclosureLead]" />
        <span>
          {{ label() }}
          @if (count()) {
            <span class="ml-1 text-accent">{{ countLabel() }}</span>
          }
        </span>
      </span>
      <!-- Keyed on the button's hover, so the chevron follows the label. -->
      <app-icon
        [glyph]="chevronDownIcon"
        class="size-4 shrink-0 text-ink-subtle transition-[transform,color]
               [button:hover_&]:text-accent"
        [class.rotate-180]="open()"
      />
    </button>
  `,
})
export class DisclosureToggle {
  protected readonly chevronDownIcon = chevronDownIcon;
  readonly label = input.required<string>();
  /** How many choices are in effect; zero shows nothing. */
  readonly count = input(0);
  /** The count as the text files word it. */
  readonly countLabel = input('');
  readonly open = input(false);
  /** The panel this opens, for `aria-controls`. */
  readonly panelId = input.required<string>();

  readonly toggled = output<void>();
}
