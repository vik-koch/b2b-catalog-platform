import { Component } from '@angular/core';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';

/**
 * The cancel beside an editor's save, with its glyph. Dialogs keep a plain one.
 *
 *   <button uiButton variant="secondary" appCancelButton type="button"
 *     (click)="cancel()">{{ actionText.cancel }}</button>
 */
@Component({
  selector: 'button[appCancelButton]',
  imports: [Icon],
  host: { class: 'gap-2' },
  template: `
    <ui-icon [glyph]="xIcon" class="size-4" />
    <ng-content />
  `,
})
export class CancelButton {
  protected readonly xIcon = xIcon;
}
