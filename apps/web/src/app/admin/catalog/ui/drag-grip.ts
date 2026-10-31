import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { Component, inject, input } from '@angular/core';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { gripVerticalIcon } from '@b2b-catalog-platform/ui/icons/glyphs/grip-vertical';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';

/**
 * The handle a `cdkDrag` row is dragged by. Not focusable: a list's keyboard
 * reordering is its own story.
 *
 *   <app-drag-grip recordControl size="lead" />
 */
@Component({
  selector: 'app-drag-grip',
  imports: [Icon],
  hostDirectives: [CdkDragHandle, { directive: IconButton, inputs: ['size'] }],
  host: {
    class: 'cursor-grab active:cursor-grabbing',
    '[attr.aria-label]': 'label() ?? text.reorder',
    '[title]': 'label() ?? text.reorder',
  },
  template: `<ui-icon [glyph]="gripVerticalIcon" />`,
})
export class DragGrip {
  protected readonly gripVerticalIcon = gripVerticalIcon;
  protected readonly text = inject(ADMIN_TEXT).actions;

  /** Overrides the shared "drag to reorder" wording. */
  readonly label = input<string | null>(null);
}
