import { Component, inject, input, OnInit, signal } from '@angular/core';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';

/** `aria-controls` must name one panel, and a page holds several. */
let nextId = 0;

/**
 * A switched feature's box (FR-ADM-20), framed like the list-shaped ones
 * beside it. Open on load where it is on; the lid says "on" where they give a
 * count.
 */
@Component({
  selector: 'app-feature-disclosure',
  imports: [Icon, DisclosureToggle, DisclosureFrame],
  host: { class: 'block' },
  template: `
    <div class="max-w-xl rounded-md border" uiDisclosureFrame [open]="open()">
      <ui-disclosure-toggle
        [label]="label()"
        [count]="on() ? 1 : 0"
        [countLabel]="text.switchedOn"
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
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class FeatureDisclosure implements OnInit {
  protected readonly text = inject(ADMIN_TEXT).products.editor;
  protected readonly panelId = `feature-disclosure-${nextId++}`;

  readonly label = input.required<string>();
  readonly glyph = input.required<Glyph>();
  readonly on = input(false);

  protected readonly open = signal(false);

  ngOnInit(): void {
    this.open.set(this.on());
  }
}
