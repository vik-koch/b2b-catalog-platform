import { Component, computed, effect, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CartLineIssue,
  CartPreviewLine,
  ProductUnit,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../catalog/price';
import { ImagePlaceholder } from '../catalog/image-placeholder';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { debounced } from '../core/debounced';
import { delayedLoading } from '../core/delayed-loading';
import { fillText } from '../core/fill-text';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { ConfirmService } from '../ui/confirm.service';
import { IconButton } from '../ui/icon-button';
import { Icon } from '../ui/icons/icon';
import { Skeleton } from '../ui/skeleton';
import { CartPreviewService } from './cart-preview.service';
import { CartService, CartStoredLine } from './cart.service';

/** A line as this page draws it: what is stored, dressed with whatever the
 * fresh pricing added. */
interface CartRow {
  line: CartStoredLine;
  unitLabel: string;
  quantity: number;
  name: string;
  note: string | null;
  image: { thumb: string; alt: string } | null;
  total: string;
  issues: string[];
}

/**
 * The cart page (FR-CART-01/02). The lines come from the browser; the prices,
 * the advisories and the shipment estimate come from `POST /cart/preview` on
 * every change, because a cart is stale by construction — a product can be
 * withdrawn, repriced or unpublished while it sits.
 *
 * Nothing here removes a line by itself. Preview flags a dead one and the page
 * says so; taking it out is the customer's action. A cart that quietly
 * shortened itself between two glances is worse than one that explains itself.
 *
 * Editing quantities, changing a line's unit and paginating a long cart are
 * the next slice; this one adds, shows, removes and clears.
 */
@Component({
  selector: 'app-cart-page',
  imports: [Button, Icon, IconButton, ImagePlaceholder, RouterLink, Skeleton],
  template: `
    <h1 class="mb-6 text-3xl font-bold tracking-tight">{{ text.title }}</h1>

    @if (cart.isEmpty()) {
      <p class="text-subtle">{{ text.empty }}</p>
      <a appButton routerLink="/catalog" class="mt-4">{{ text.emptyAction }}</a>
    } @else {
      @if (cart.persistFailed()) {
        <p class="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {{ text.storageFailed }}
        </p>
      }
      @if (preview.error()) {
        <p class="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {{ text.loadError }}
        </p>
      }

      <div class="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <ul class="divide-y divide-border border-y border-border">
          @for (row of rows(); track row.line.slug + row.line.unit) {
            <li class="flex gap-4 py-4">
              <a
                [routerLink]="['/product', row.line.slug]"
                class="h-20 w-20 shrink-0"
              >
                @if (row.image; as image) {
                  <img
                    [src]="image.thumb"
                    [alt]="image.alt"
                    class="h-20 w-20 rounded-md object-cover"
                  />
                } @else {
                  <app-image-placeholder class="h-20 w-20 rounded-md" />
                }
              </a>

              <div class="min-w-0 flex-1">
                <a
                  [routerLink]="['/product', row.line.slug]"
                  class="font-medium hover:text-accent"
                >
                  {{ row.name }}
                </a>
                <p class="mt-1 text-sm text-subtle">
                  {{ row.quantity }} × {{ row.unitLabel }}
                </p>
                @if (row.note) {
                  <p class="mt-1 text-sm">
                    <span class="text-subtle">{{ text.lineNote }}:</span>
                    {{ row.note }}
                  </p>
                }
                @for (issue of row.issues; track issue) {
                  <p class="mt-1 text-sm text-amber-700">{{ issue }}</p>
                }
              </div>

              <div class="flex flex-col items-end gap-2">
                <span class="font-medium">{{ row.total }}</span>
                <!-- Icon only: the product it removes is the row it sits in,
                     so spelling the name out again made every line carry a
                     sentence. It stays the button's accessible name. -->
                <button
                  type="button"
                  appIconButton
                  variant="danger"
                  [attr.aria-label]="removeLabel(row)"
                  (click)="remove(row)"
                >
                  <app-icon name="trash-2" class="h-4 w-4" />
                </button>
              </div>
            </li>
          }
        </ul>

        <aside class="space-y-4">
          <!-- One card, read top to bottom: what ships, when it is confirmed,
               and what it comes to. Splitting the total off into a card of its
               own made the customer read two boxes to answer one question. -->
          <div class="rounded-lg border border-border p-5">
            <h2 class="mb-3 font-medium">{{ text.shipmentTitle }}</h2>
            <dl class="space-y-2 text-sm">
              @for (row of shipmentRows(); track row.label) {
                <div class="flex items-baseline justify-between gap-4">
                  <dt class="text-subtle">{{ row.label }}</dt>
                  <dd class="text-right">{{ row.value }}</dd>
                </div>
              } @empty {
                @if (showSkeleton()) {
                  <app-skeleton [lines]="3" />
                }
              }
              <div
                class="flex items-baseline justify-between gap-4 border-t border-border pt-3"
              >
                <dt class="text-subtle">{{ text.subtotal }}</dt>
                <dd class="text-xl font-bold text-primary">{{ subtotal() }}</dd>
              </div>
            </dl>
            @if (!complete()) {
              <p class="mt-2 text-sm text-amber-700">
                {{ text.totalIncomplete }}
              </p>
            }
            @if (shipmentRows().length) {
              <p class="mt-3 text-xs text-subtle">
                {{ text.shipmentApproximate }}
              </p>
              @if (uncoveredLines(); as count) {
                <p class="mt-1 text-xs text-amber-700">
                  {{ uncoveredMessage() }}
                </p>
              }
            }
          </div>

          <button
            type="button"
            appButton
            variant="dangerOutline"
            class="w-full"
            (click)="clear()"
          >
            {{ text.clear }}
          </button>
        </aside>
      </div>
    }
  `,
})
export class CartPage {
  protected readonly cart = inject(CartService);
  private readonly pricing = inject(CartPreviewService);
  private readonly confirm = inject(ConfirmService);
  private readonly catalogConfig = inject(DEPLOYMENT_CONFIG).catalog;
  private readonly currency = this.catalogConfig.currency;
  private readonly boxUnits = this.catalogConfig.boxUnits;

  protected readonly text = inject(APP_TEXT).cart;
  private readonly unitText = inject(APP_TEXT).catalog.units;

  /**
   * Debounced so a run of edits — a removal, then another — costs one call
   * rather than one each. The cart is the source of truth for *what* is in it;
   * this only ever asks what it costs now.
   */
  private readonly request = debounced(this.cart.request, 250);

  protected readonly preview = resource({
    params: () => ({ lines: this.request() }),
    loader: ({ params }) =>
      params.lines.length === 0
        ? Promise.resolve(undefined)
        : this.pricing.preview(params.lines),
  });

  protected readonly showSkeleton = delayedLoading(this.preview.isLoading);

  /** The priced answer, indexed the way lines are identified. */
  private readonly priced = computed(() => {
    const value = this.preview.hasValue() ? this.preview.value() : undefined;
    return new Map(
      (value?.lines ?? []).map((line) => [`${line.slug} ${line.unit}`, line]),
    );
  });

  protected readonly rows = computed<CartRow[]>(() =>
    this.cart.lines().map((line) => {
      const fresh = this.priced().get(`${line.slug} ${line.unit}`);
      const total = fresh ? fresh.lineTotalMinor : line.lineTotalMinor;
      return {
        line,
        unitLabel: this.unitName(line.unit),
        quantity: fresh?.quantity ?? line.quantity,
        name: fresh?.name ?? line.name,
        note: fresh ? fresh.note : line.note,
        image: this.imageOf(fresh, line.name),
        total:
          total === null
            ? this.text.noPrice
            : formatPriceMinor(total, this.currency),
        issues: (fresh?.issues ?? []).map((issue) => this.issueText(issue)),
      };
    }),
  );

  /** The stored total until a fresh one arrives, so the figure never blanks
   * between two prices. */
  protected readonly subtotal = computed(() => {
    const value = this.preview.hasValue() ? this.preview.value() : undefined;
    return formatPriceMinor(
      value?.totalMinor ?? this.cart.totalMinor(),
      this.currency,
    );
  });

  protected readonly complete = computed(() => {
    const value = this.preview.hasValue() ? this.preview.value() : undefined;
    return value?.complete ?? this.cart.totalComplete();
  });

  /**
   * The shipment estimate as labelled rows (FR-UNIT-11), empty before one has
   * arrived. A table rather than sentences: a customer checking a consignment
   * is comparing figures against a delivery note, and figures compare by
   * lining up.
   *
   * The delivery row is deliberately not a date. Every order here is a request
   * a manager prices and confirms, so a computed date would be the one figure
   * on this card the shop has not agreed to.
   */
  protected readonly shipmentRows = computed<
    { label: string; value: string }[]
  >(() => {
    const value = this.preview.hasValue() ? this.preview.value() : undefined;
    if (!value || value.shipment.coveredLines === 0) return [];
    const { shipment } = value;
    const rows = [
      { label: this.text.shipmentCartons, value: String(shipment.cartons) },
    ];
    if (shipment.volume) {
      rows.push({
        label: this.text.shipmentVolume,
        value: `${shipment.volume} ${this.boxUnits.volume}`,
      });
    }
    if (shipment.weight) {
      rows.push({
        label: this.text.shipmentWeight,
        value: `${shipment.weight} ${this.boxUnits.weight}`,
      });
    }
    rows.push({
      label: this.text.shipmentDelivery,
      value: this.text.shipmentDeliveryValue,
    });
    return rows;
  });

  /** How many lines the estimate could not cover, or null where it covered
   * them all — a summary of half the cart says so rather than omitting the
   * rest in silence. */
  protected readonly uncoveredLines = computed(() => {
    const value = this.preview.hasValue() ? this.preview.value() : undefined;
    const uncovered = value?.shipment.uncoveredLines ?? 0;
    return uncovered > 0 ? uncovered : null;
  });

  protected readonly uncoveredMessage = computed(() =>
    fillText(this.text.shipmentUncovered, {
      count: this.uncoveredLines() ?? 0,
    }),
  );

  constructor() {
    // Nothing here is indexable: the page is a lens on the visitor's own
    // browser state, and every visitor's is different.
    usePageSeo({ name: () => this.text.title, noindex: true });
    // A fresh answer is also a fresh baseline: corrected quantities, dropped
    // notes and current prices go back into the store, so the header agrees
    // with this page and FR-CART-10 compares against what was last seen.
    effect(() => {
      if (!this.preview.hasValue()) return;
      const value = this.preview.value();
      if (value) this.cart.applyPreview(value);
    });
  }

  protected removeLabel(row: CartRow): string {
    return fillText(this.text.remove, { name: row.name });
  }

  protected remove(row: CartRow): void {
    this.cart.remove(row.line.slug, row.line.unit);
  }

  protected async clear(): Promise<void> {
    const ok = await this.confirm.ask({
      heading: this.text.clearHeading,
      message: fillText(this.text.clearConfirm, { count: this.cart.count() }),
      confirmLabel: this.text.clear,
      cancelLabel: this.text.cancel,
    });
    if (ok) this.cart.clear();
  }

  private unitName(unit: ProductUnit): string {
    if (unit === 'pack') return this.unitText.packName;
    if (unit === 'box') return this.unitText.boxName;
    return this.unitText.pieceName;
  }

  private imageOf(
    line: CartPreviewLine | undefined,
    name: string,
  ): { thumb: string; alt: string } | null {
    if (!line?.image) return null;
    return { thumb: line.image.thumb, alt: name };
  }

  private issueText(issue: CartLineIssue): string {
    const issues = this.text.issues;
    if (issue === 'unit-unavailable') return issues.unitUnavailable;
    if (issue === 'quantity-corrected') return issues.quantityCorrected;
    if (issue === 'note-not-allowed') return issues.noteNotAllowed;
    if (issue === 'price-unavailable') return issues.priceUnavailable;
    return issues.unavailable;
  }
}
