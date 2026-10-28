import { Component, input, output } from '@angular/core';
import { Button } from '../actions/button';

/**
 * The button under something clipped. It owns the control and its words, never
 * the clipping, which differs at every call site. The host only centres itself;
 * margin and width stay with the caller.
 */
@Component({
  selector: 'app-show-more-toggle',
  imports: [Button],
  host: { class: 'flex justify-center' },
  template: `
    <button
      type="button"
      appButton
      variant="ghost"
      size="sm"
      [attr.aria-expanded]="expanded()"
      [attr.aria-controls]="controls() || null"
      (click)="toggled.emit()"
    >
      {{ expanded() ? lessLabel() : moreLabel() }}
    </button>
  `,
})
export class ShowMoreToggle {
  readonly expanded = input(false);
  readonly moreLabel = input.required<string>();
  readonly lessLabel = input.required<string>();
  /** The id of the region this opens, where it has one. */
  readonly controls = input('');

  readonly toggled = output<void>();
}
