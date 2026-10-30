import { Component, input, model } from '@angular/core';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';

/** `aria-controls` must name one panel, and a page holds several. */
let nextId = 0;

/**
 * One of the product editor's boxes: a lid with its glyph and count, the
 * hint and the editor under it. The caller owns `open`, which says when it
 * opens on its own.
 *
 *   <app-sub-editor-frame [label]="…" [glyph]="…" [count]="n"
 *     [countLabel]="…" [hint]="…" [(open)]="open">…</app-sub-editor-frame>
 */
@Component({
  selector: 'app-sub-editor-frame',
  imports: [Icon, DisclosureToggle, DisclosureFrame],
  host: { class: 'block' },
  template: `
    <div class="max-w-xl rounded-md border" uiDisclosureFrame [open]="open()">
      <ui-disclosure-toggle
        [label]="label()"
        [count]="count()"
        [countLabel]="countLabel()"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      >
        <ui-icon
          disclosureLead
          [glyph]="glyph()"
          class="size-4 text-ink-subtle"
        />
      </ui-disclosure-toggle>
      @if (open()) {
        <div [id]="panelId" class="border-t border-edge p-4">
          @if (hint(); as hint) {
            <p class="text-xs text-ink-subtle">{{ hint }}</p>
          }
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class SubEditorFrame {
  protected readonly panelId = `sub-editor-${++nextId}`;

  readonly label = input.required<string>();
  readonly glyph = input.required<Glyph>();
  readonly count = input(0);
  readonly countLabel = input('');
  readonly hint = input<string | null>(null);
  readonly open = model(false);
}
