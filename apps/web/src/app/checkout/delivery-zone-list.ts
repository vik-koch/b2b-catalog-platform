import { Component, inject, input } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { formatPriceMinor } from '../catalog/price';
import { EmphasisedText } from '../ui/emphasised-text';
import { Icon } from '../ui/icons/icon';

/**
 * How wide a card is in a row of `n`, on a twelve-column grid. Written out so
 * Tailwind's scanner sees every class; a row of more than four wraps at four.
 */
const SPAN: Record<number, string> = {
  1: 'sm:col-span-12',
  2: 'sm:col-span-6',
  3: 'sm:col-span-4',
  4: 'sm:col-span-3',
};

/**
 * The deployment's delivery zones, one card each (FR-CART-07) — drawn by the
 * checkout dialog and the conditions page alike, so the two cannot state a zone
 * differently.
 *
 * Spread, as the conditions page draws it, each card carries a glyph and
 * neighbouring zones of the same `level` share a row from `sm` up. The dialog
 * keeps the plain list: it is narrow, and it sits in the checkout form.
 */
@Component({
  selector: 'app-delivery-zone-list',
  host: { class: 'block' },
  imports: [EmphasisedText, Icon],
  template: `
    <ul [class]="spread() ? 'grid gap-3 sm:grid-cols-12' : 'space-y-3'">
      @for (zone of zones; track zone.key; let i = $index) {
        <li
          class="rounded-lg border border-border p-4"
          [class]="spread() ? 'flex gap-3 ' + spans[i] : ''"
        >
          @if (spread()) {
            <app-icon name="map" class="mt-0.5 size-5 shrink-0 text-subtle" />
          }
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ zone.title }}</p>
            @if (zone.description; as description) {
              <p class="mt-1 text-sm text-muted">
                <app-emphasised [text]="description" />
              </p>
            }
            <!-- Said out loud either way: a zone with no line under it would
                 read as an unstated free threshold rather than none. -->
            <p class="mt-2 text-sm text-subtle">{{ terms(zone) }}</p>
          </div>
        </li>
      }
    </ul>
  `,
})
export class DeliveryZoneList {
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;

  protected readonly text = inject(APP_TEXT).checkout.fulfilment;
  protected readonly zones = this.config.delivery?.zones ?? [];

  /** A glyph per card, and levels side by side. */
  readonly spread = input(false);

  protected readonly spans = rowSpans(this.zones.map((zone) => zone.level));

  protected terms(zone: {
    readonly delivers?: boolean;
    readonly freeFromMinor?: number;
  }): string {
    if (zone.delivers === false) return this.text.noDelivery;
    return zone.freeFromMinor === undefined
      ? this.text.noFreeDelivery
      : fillText(this.text.freeFrom, {
          amount: formatPriceMinor(zone.freeFromMinor, this.currency),
        });
  }
}

/** Each zone's width: a run of neighbours sharing a level splits a row. */
function rowSpans(levels: readonly (number | undefined)[]): string[] {
  const spans: string[] = [];
  let start = 0;
  while (start < levels.length) {
    const level = levels[start];
    let end = start + 1;
    while (level !== undefined && levels[end] === level) end++;
    const span = SPAN[Math.min(end - start, 4)];
    for (let i = start; i < end; i++) spans.push(span);
    start = end;
  }
  return spans;
}
