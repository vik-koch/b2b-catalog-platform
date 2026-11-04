import { Component, input, output } from '@angular/core';
import { Switch } from '@b2b-catalog-platform/ui/choices/switch';
import { Card } from '@b2b-catalog-platform/ui/content/card';

/**
 * A runtime switch on its card: the caller's `[switchCardTitle]` beside the
 * switch, and what the switch does beneath.
 */
@Component({
  selector: 'app-switch-card',
  imports: [Switch],
  hostDirectives: [Card],
  host: { class: 'block' },
  template: `
    <div class="flex items-center justify-between gap-4">
      <ng-content select="[switchCardTitle]" />
      <ui-switch
        [checked]="checked()"
        [label]="label()"
        [disabled]="disabled()"
        (toggled)="toggled.emit($event)"
      />
    </div>
    <ng-content />
  `,
})
export class SwitchCard {
  readonly checked = input.required<boolean>();
  /** The switch's accessible name: what flipping it does. */
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly toggled = output<boolean>();
}
