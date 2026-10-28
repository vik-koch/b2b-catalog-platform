import { Component } from '@angular/core';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { triangleAlertIcon } from '@b2b-catalog-platform/ui/icons/glyphs/triangle-alert';

/**
 * A remark to weigh before going on that refuses nothing: amber, with its own
 * triangle, so it is told apart from a red line, which always means the app
 * would not do something.
 *
 *   <app-warning-note>{{ text.warnPaid }}</app-warning-note>
 */
@Component({
  selector: 'app-warning-note',
  imports: [Icon],
  host: { class: 'flex items-start gap-2 text-sm text-warning' },
  template: `
    <app-icon [glyph]="triangleAlertIcon" class="mt-0.5 size-4 shrink-0" />
    <span class="min-w-0"><ng-content /></span>
  `,
})
export class WarningNote {
  protected readonly triangleAlertIcon = triangleAlertIcon;
}
