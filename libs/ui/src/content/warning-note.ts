import { Component } from '@angular/core';
import { Icon } from '../icons/icon';
import { triangleAlertIcon } from '../icons/glyphs/triangle-alert';

/**
 * A remark to weigh before going on that refuses nothing: amber, with its own
 * triangle, so it is told apart from a red line, which always means the app
 * would not do something.
 *
 *   <ui-warning-note>{{ text.warnPaid }}</ui-warning-note>
 */
@Component({
  selector: 'ui-warning-note',
  imports: [Icon],
  host: { class: 'flex items-start gap-2 text-sm text-warning' },
  template: `
    <ui-icon [glyph]="triangleAlertIcon" class="mt-0.5 size-4 shrink-0" />
    <span class="min-w-0"><ng-content /></span>
  `,
})
export class WarningNote {
  protected readonly triangleAlertIcon = triangleAlertIcon;
}
