import { Component, input } from '@angular/core';

import { Glyph } from '../icons/glyph';
import { Icon } from '../icons/icon';

/**
 * A sentence led by a glyph that says what it is about before it is read. The
 * glyph sits on the first line, so a wrapped sentence keeps it at the top.
 * Type size, colour and spacing stay with the caller.
 *
 *   <p uiIconNote class="text-sm text-ink-subtle" [glyph]="lockIcon">…</p>
 */
@Component({
  selector: '[uiIconNote]',
  imports: [Icon],
  host: { class: 'flex items-start gap-2' },
  template: `
    <ui-icon [glyph]="glyph()" class="mt-0.5 size-4 shrink-0" />
    <span class="min-w-0"><ng-content /></span>
  `,
})
export class IconNote {
  readonly glyph = input.required<Glyph>();
}
