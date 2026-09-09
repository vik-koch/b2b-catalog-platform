import { Component } from '@angular/core';
import { Icon } from './icons/icon';

/**
 * A remark the reader should weigh before going on, and that refuses nothing:
 * an order already paid, a price off the list, a total that cannot be
 * completed. Amber and marked with a triangle, so it is told apart at a glance
 * from a red line, which always means the app would not do something.
 *
 *   <app-warning-note>{{ text.warnPaid }}</app-warning-note>
 *
 * The glyph is the style's, not the call site's, so it is named here. It comes
 * from the storefront set: a warning is worth saying on either side of the app,
 * and this cannot reach for an admin-only one.
 */
@Component({
  selector: 'app-warning-note',
  imports: [Icon],
  host: { class: 'flex items-start gap-2 text-sm text-amber-700' },
  template: `
    <app-icon name="triangle-alert" class="mt-0.5 h-4 w-4 shrink-0" />
    <span class="min-w-0"><ng-content /></span>
  `,
})
export class WarningNote {}
