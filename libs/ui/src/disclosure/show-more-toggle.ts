import { Component, inject, input, output } from '@angular/core';
import { Button } from '../actions/button';
import { UI_TEXT } from '../core/ui-text';

/**
 * The button under something clipped. It owns the control and its words, never
 * the clipping, which differs at every call site. The host only centres itself;
 * margin and width stay with the caller.
 */
@Component({
  selector: 'ui-show-more-toggle',
  imports: [Button],
  host: { class: 'flex justify-center' },
  template: `
    <button
      type="button"
      uiButton
      variant="ghost"
      size="sm"
      [attr.aria-expanded]="expanded()"
      [attr.aria-controls]="controls() || null"
      (click)="toggled.emit()"
    >
      {{ expanded() ? text.showLess : text.showMore }}
    </button>
  `,
})
export class ShowMoreToggle {
  protected readonly text = inject(UI_TEXT);

  readonly expanded = input(false);
  /** The id of the region this opens, where it has one. */
  readonly controls = input('');

  readonly toggled = output<void>();
}
