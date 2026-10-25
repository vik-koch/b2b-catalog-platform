import { Component, input, output } from '@angular/core';
import { Button } from './button';

/**
 * The button under something that has been clipped: the gallery's thumbnails,
 * a long description, a list of subcategories.
 *
 * It owns the control and the word for its state, never the clipping — what is
 * hidden and how it comes back differs at every call site, and the only thing
 * they ever shared was the button, spelled out four times.
 *
 * The labels come in rather than from APP_TEXT: nothing in `ui/` knows the
 * deployment's words. The host centres itself and nothing more, so the call
 * site keeps the margin and the width it is shown at.
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
