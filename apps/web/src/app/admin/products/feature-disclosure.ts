import { Component, inject, input, OnInit, signal } from '@angular/core';
import { ADMIN_TEXT } from '../../config/admin-text';
import {
  DISCLOSURE_FRAME,
  disclosureBorder,
  DisclosureToggle,
} from '../../ui/disclosure-toggle';
import { AdminIcon, AdminIconName } from '../../ui/icons/admin-icon';

/** `aria-controls` must name one panel, and a page holds several. */
let nextId = 0;

/**
 * The box a switched product feature is set in (FR-ADM-20) — featured, the
 * line note — framed exactly as the list-shaped ones beside it (variants, a
 * set's parts, pairings, documents), so the six read as one run of optional
 * extras below the product's own facts.
 *
 * Opens on load where the feature is on and stays shut where it is not, the
 * rule the other five follow with their counts. The lid says "on" where they
 * say how many, so a shut box still answers whether it is in use.
 */
@Component({
  selector: 'app-feature-disclosure',
  imports: [AdminIcon, DisclosureToggle],
  host: { class: 'block' },
  template: `
    <div
      class="max-w-xl rounded-md border"
      [class]="frame + ' ' + disclosureBorder(open())"
    >
      <app-disclosure-toggle
        [label]="label()"
        [count]="on() ? 1 : 0"
        [countLabel]="text.switchedOn"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      >
        <app-admin-icon
          disclosureLead
          [name]="glyph()"
          class="size-4 text-subtle"
        />
      </app-disclosure-toggle>
      @if (open()) {
        <div [id]="panelId" class="border-t border-border p-4">
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class FeatureDisclosure implements OnInit {
  protected readonly frame = DISCLOSURE_FRAME;
  protected readonly disclosureBorder = disclosureBorder;
  protected readonly text = inject(ADMIN_TEXT).productEditor;
  protected readonly panelId = `feature-disclosure-${nextId++}`;

  readonly label = input.required<string>();
  readonly glyph = input.required<AdminIconName>();
  /** Whether the feature is switched on. */
  readonly on = input(false);

  protected readonly open = signal(false);

  ngOnInit(): void {
    this.open.set(this.on());
  }
}
