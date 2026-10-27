import { Component } from '@angular/core';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { triangleAlertIcon } from '@b2b-catalog-platform/ui/icons/glyphs/triangle-alert';

/**
 * A remark the reader should weigh before going on, and that refuses nothing:
 * an order already paid, a price off the list, a total that cannot be
 * completed. Amber and marked with a triangle, so it is told apart at a glance
 * from a red line, which always means the app would not do something.
 *
 *   <app-warning-note>{{ text.warnPaid }}</app-warning-note>
 *
 * The glyph is the style's, not the call site's, so it is named here.
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
