import { Component, computed, inject, input } from '@angular/core';
import { unitQuantity } from '@b2b-catalog-platform/shared';
import { CartService, CartStoredLine } from '../cart/cart.service';
import { formatPriceMinor } from '../catalog/price';
import { formatUnitQuantity } from '../catalog/quantity';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { fillText } from '../core/fill-text';

/**
 * What the customer answered, read back before it is sent (ADR 0039) — the
 * second screen of the two, and the last thing between a filled form and an
 * order somebody has to unpick by phone.
 *
 * Everything but the lines is handed over already resolved: which address a
 * picker settled on, and what a chosen party is called, are the page's
 * questions and it has just answered them for the submission. Working them out
 * a second time here would be a second opinion that can differ from the one
 * being sent.
 *
 * Read-only throughout, and deliberately not the cart's own row: those rows
 * carry a stepper, a unit selector and a remove button, which is the wrong
 * offer on a screen whose question is "is this right?". Changing anything is
 * one link back to where it was answered.
 */
@Component({
  selector: 'app-order-review',
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <section>
        <h2 class="mb-2 font-medium">{{ text.items }}</h2>
        <ul class="divide-y divide-border border-y border-border">
          @for (line of lines(); track line.slug) {
            <li class="flex items-baseline justify-between gap-4 py-2 text-sm">
              <span class="min-w-0">
                <span class="block">{{ line.name }}</span>
                <span class="text-subtle">{{ line.quantity }}</span>
                @if (line.note) {
                  <span class="mt-0.5 block text-subtle italic">
                    {{ line.note }}
                  </span>
                }
              </span>
              <span class="shrink-0 text-right">{{ line.total }}</span>
            </li>
          }
        </ul>
      </section>

      <!-- One block per question the form asked, in the order it asked them.
           A customer checking their answers is walking back down the same
           page. -->
      @for (block of blocks(); track block.heading) {
        <section>
          <h2 class="mb-2 font-medium">{{ block.heading }}</h2>
          @for (line of block.lines; track $index) {
            <p class="text-sm" [class.text-subtle]="$index > 0">{{ line }}</p>
          }
        </section>
      }
    </div>
  `,
})
export class OrderReview {
  private readonly cart = inject(CartService);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  private readonly units = inject(APP_TEXT).catalog.units;

  protected readonly text = inject(APP_TEXT).checkout.review;

  /** The answers, resolved by the page that collected them. */
  readonly blocks = input.required<readonly ReviewBlock[]>();

  protected readonly lines = computed(() =>
    this.cart.lines().map((line) => ({
      slug: line.slug,
      name: line.name,
      note: line.note,
      quantity: this.quantity(line),
      // A dash rather than a zero: a line the shop cannot price yet is not a
      // free one, and the summary beside this says so in full.
      total:
        line.lineTotalMinor === null
          ? '—'
          : formatPriceMinor(line.lineTotalMinor, this.currency),
    })),
  );

  /**
   * The quantity as the line's own unit reads it — and, where that unit is not
   * the piece, what it comes to in pieces. The unit is a lens on a piece count
   * (FR-UNIT-01), and a review is the one screen where the figure the shop
   * actually picks is worth spelling out beside the one that was ordered.
   */
  private quantity(line: CartStoredLine): string {
    const qty = formatUnitQuantity(
      unitQuantity(line.packaging, line.unit, line.pieces) ?? line.pieces,
      this.currency,
    );
    const unit = this.units[line.unit];
    if (line.unit === 'piece') {
      return fillText(this.text.quantity, { qty, unit });
    }
    return fillText(this.text.quantityPieces, {
      qty,
      unit,
      pieces: formatUnitQuantity(line.pieces, this.currency),
      pieceUnit: this.units.piece,
    });
  }
}

/** One answered question: its heading, then what was answered — the first line
 * is the answer itself, the rest are its detail. */
export interface ReviewBlock {
  readonly heading: string;
  readonly lines: readonly string[];
}
