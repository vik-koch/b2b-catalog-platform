import { Component, input } from '@angular/core';
import { Glyph } from '../icons/glyph';
import { Icon } from '../icons/icon';

/**
 * A file or page to open, as one row: glyph, underlined title, and what
 * pressing it gets under it. The whole row is the link, which is what a finger
 * aims at. Opens a new tab.
 *
 *   <a uiDocumentLink [href]="url" [glyph]="fileTextIcon" caption="PDF · 240 kB">
 *     {{ title }}
 *   </a>
 */
@Component({
  selector: 'a[uiDocumentLink]',
  imports: [Icon],
  host: {
    class: 'group flex items-start gap-3 py-2.5',
    target: '_blank',
    rel: 'noopener',
  },
  template: `
    <ui-icon [glyph]="glyph()" class="mt-0.5 size-4 shrink-0 text-ink-subtle" />
    <span class="min-w-0">
      <span
        class="block font-medium text-primary underline decoration-primary/30
               underline-offset-2
               group-hover:text-accent group-hover:decoration-accent"
      >
        <ng-content />
      </span>
      <span class="block text-xs text-ink-subtle">{{ caption() }}</span>
    </span>
  `,
})
export class DocumentLink {
  readonly glyph = input.required<Glyph>();
  readonly caption = input.required<string>();
}
