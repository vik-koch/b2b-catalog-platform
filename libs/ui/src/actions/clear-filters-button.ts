import { Component, input, output } from '@angular/core';
import { Icon } from '../icons/icon';
import { IconButton, IconButtonSize } from './icon-button';
import { funnelXIcon } from '../icons/glyphs/funnel-x';

/**
 * Back to the whole list: a glyph, so it fits the line of the box it clears.
 * Always on screen and disabled until there is something to undo, so nothing
 * beside it moves. The caller decides what clearing means.
 *
 *   <ui-clear-filters-button [label]="text.clearAll" [filtered]="any()"
 *     (cleared)="selection.clearAll()" />
 */
@Component({
  selector: 'ui-clear-filters-button',
  imports: [Icon, IconButton],
  template: `
    <button
      uiIconButton
      type="button"
      class="disabled:opacity-40"
      [variant]="filtered() ? 'danger' : 'default'"
      [size]="size()"
      [disabled]="!filtered()"
      [attr.aria-label]="label()"
      [title]="label()"
      (click)="cleared.emit()"
    >
      <ui-icon [glyph]="funnelXIcon" />
    </button>
  `,
})
export class ClearFiltersButton {
  protected readonly funnelXIcon = funnelXIcon;

  readonly label = input.required<string>();
  /** Whether anything narrows the list. */
  readonly filtered = input(false);
  readonly size = input<IconButtonSize>('sm');

  readonly cleared = output();
}
