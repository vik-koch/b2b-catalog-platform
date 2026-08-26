import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CART_NOTE_MAX, CartLineIssue } from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../catalog/price';
import { PRODUCT_ROWS, ProductRow, RowProduct } from '../catalog/product-row';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { debounced } from '../core/debounced';
import { delayedLoading } from '../core/delayed-loading';
import { fillText } from '../core/fill-text';
import { usePageSeo } from '../core/page-seo';
import { stableValue } from '../core/stable-value';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { AutoGrow } from '../ui/auto-grow';
import { Input } from '../ui/input';
import { ConfirmService } from '../ui/confirm.service';
import { IconButton } from '../ui/icon-button';
import { Icon } from '../ui/icons/icon';
import { Skeleton } from '../ui/skeleton';
import { CartPreviewService } from './cart-preview.service';
import { CartChange, CartService } from './cart.service';

/**
 * How many lines a page of the cart holds (FR-CART-02). A cart row is a
 * product row — photo, controls, note — so a long cart is a long scroll rather
 * than a long list, and the summary beside it would drift a screen away from
 * the lines it adds up.
 *
 * Not in the URL, unlike the catalog's paging: the cart is a lens on this
 * browser's own storage, so there is no page here anybody could link to.
 */
const CART_PAGE_SIZE = 10;

/**
 * The issues that say what just happened to a line rather than what is still
 * wrong with it, most consequential first. Both are answered once and then
 * gone: the corrected line is written back and asked about again.
 */
const NOTICE_ISSUES: readonly CartLineIssue[] = [
  'unit-unavailable',
  'quantity-corrected',
];

/**
 * A line as this page draws it: the product the row's controls edit, plus what
 * belongs to the line rather than to the product — its note, and whatever
 * preview had to say about it.
 *
 * `item` is built from the *stored* line, not from the priced answer: the
 * controls have to be there on the first frame and have to survive a preview
 * that fails, which is why the cart keeps a line's prices and packaging.
 */
interface CartRow {
  /** The slug, which is what identifies a line: a product is one line, in
   * whichever unit it is currently held in. Deliberately not the unit as well
   * — a tick has to survive the customer changing it. */
  key: string;
  slug: string;
  available: boolean;
  item: RowProduct;
  name: string;
  note: string | null;
  /** The product's own wording for the note, or the app's. */
  notePrompt: string;
  takesNote: boolean;
  issues: string[];
  /** The advisories that are feedback rather than a state: they go in the
   * bubble under the stepper they are about, not in the list below the name. */
  notice: string | null;
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
 * A line is the same product row a listing draws, carrying the same buying
 * controls: the unit selector and the stepper edit the line in place, so there
 * is no separate way to change a cart from the way it was filled. What the row
 * adds here is a tick box and a bin — and the ticks are what "empty the cart"
 * used to be, since selecting all of them and deleting the selection says the
 * same thing without a control that only ever does one thing.
 */
@Component({
  selector: 'app-cart-page',
  imports: [
    AutoGrow,
    Button,
    Checkbox,
    Icon,
    IconButton,
    Input,
    ProductRow,
    RouterLink,
    Skeleton,
  ],
  template: `
    <h1 class="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
      {{ text.title }}
    </h1>

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

      <!-- What moved while the cart sat (FR-CART-10). Above the lines and
           dismissible, because it is news rather than a state: every line it
           names also says for itself what is wrong with it, and this is the
           one place that says it happened *since last time*. -->
      @if (changes().length) {
        <section
          class="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          [attr.aria-label]="changeText.heading"
        >
          <div class="flex items-start justify-between gap-4">
            <h2 class="font-medium">{{ changeText.heading }}</h2>
            <button
              type="button"
              appIconButton
              shape="plain"
              class="-mt-1 -mr-1 shrink-0"
              [attr.aria-label]="changeText.dismiss"
              (click)="cart.dismissChanges()"
            >
              <app-icon name="close" class="h-4 w-4" />
            </button>
          </div>
          <ul class="mt-1 space-y-1">
            @for (change of changes(); track change.slug) {
              <li>{{ changeMessage(change) }}</li>
            }
          </ul>
        </section>
      }

      <!-- The summary moves out to the right only where taking its width off
           the lines still leaves them their three columns (ProductRow's own
           49rem, plus the 1.5rem the tick box takes off every line here). One
           notch earlier, the column arrived by rearranging every line beside
           it — one drag of the window edge redrew the whole page.

           Measured on the page rather than on the window: the frame's padding
           and the scrollbar are most of a column of controls, and the media
           query cannot see either. -->
      <div class="@container/cart">
        <div class="grid gap-8 @min-[72.5rem]/cart:grid-cols-[1fr_20rem]">
          <div>
            <!-- Above the lines and left-aligned with them: what these two do is
               done *to* the ticks below, so they read before the first row
               rather than after the last. -->
            <div class="flex items-center gap-4 pb-2 text-sm">
              <!-- A tick box of its own, in the column the rows' tick boxes are
                 in: it is the same control, applied to all of them. Half
                 ticked while only some are — the box says what the ticks below
                 add up to. -->
              <label class="flex cursor-pointer items-center gap-2 text-accent">
                <input
                  type="checkbox"
                  appCheckbox
                  [checked]="allSelected()"
                  [indeterminate]="someSelected() && !allSelected()"
                  (change)="toggleAll()"
                />
                <span class="hover:underline">
                  {{ allSelected() ? text.clearSelection : text.selectAll }}
                </span>
              </label>
              <!-- Disabled rather than hidden: a control that appears with the
                 first tick moves the whole list down as it is ticked. -->
              <button
                type="button"
                class="group flex cursor-pointer items-center gap-1.5 text-red-700 disabled:cursor-not-allowed disabled:text-stone-400"
                [disabled]="selectedCount() === 0"
                (click)="deleteSelected()"
              >
                <app-icon name="trash-2" class="h-4 w-4" />
                <span class="group-enabled:group-hover:underline">
                  {{ text.deleteSelected }}
                </span>
              </button>
            </div>

            <ul [class]="rowList">
              <!-- Tracked by the product, not by the product and its unit: one
                 product is one line, so changing its unit edits that line. On
                 the key it would be a different line — the row would be torn
                 down and rebuilt, and its photo would be fetched again. -->
              @for (row of pageRows(); track row.slug) {
                <li>
                  <app-product-row
                    [item]="row.item"
                    [available]="row.available"
                    [externalNote]="true"
                    [notice]="row.notice"
                  >
                    <!-- Level with the top of the photo, and as close to it as
                       the tick above the list is to its own words, so the two
                       read as the same control. -->
                    <label rowSelect class="-mr-2 flex shrink-0 items-start">
                      <input
                        type="checkbox"
                        appCheckbox
                        [checked]="isSelected(row.key)"
                        [attr.aria-label]="selectLabel(row)"
                        (change)="toggle(row.key)"
                      />
                    </label>

                    @for (issue of row.issues; track issue) {
                      <p class="mt-1 text-sm text-amber-700">{{ issue }}</p>
                    }

                    @if (row.takesNote) {
                      <!-- Under the name, in the name's own column: a note is
                         about this product, and a field the width of the whole
                         line read as being about the cart. The placeholder is
                         the product's question, so it needs no label.

                         It drops to the bottom of that column, which
                         is the photo's own bottom edge — a short name leaves it
                         there rather than hanging it under one line of text. A
                         name long enough to need the room pushes it down
                         instead.

                         A text area, as everywhere else a sentence is typed,
                         one line deep until the customer drags it taller —
                         the height of the pill of segments across from it,
                         and dense to match: the row is a line of small
                         controls, and a full-sized field among them reads as
                         the thing to fill in. -->
                      <div class="mt-auto pt-2">
                        <textarea
                          appInput
                          appAutoGrow
                          size="sm"
                          rows="1"
                          class="w-full"
                          [attr.maxlength]="noteMax"
                          [attr.placeholder]="row.notePrompt"
                          [attr.aria-label]="text.lineNote"
                          [value]="row.note ?? ''"
                          (change)="onNote(row, $event)"
                        ></textarea>
                      </div>
                    }

                    <!-- Icon only: the product it removes is the row it sits in,
                       so spelling the name out again made every line carry a
                       sentence. It stays the button's accessible name.

                       It rides in the price row's own corner, above the
                       figure the line comes to and well away from the stepper
                       and the segments it must never be pressed instead of.
                       The glyph alone: the disc is what an admin affordance
                       laid over content wears, and this one sits in a line of
                       it, beside the note button it must match. -->
                    <button
                      rowActions
                      type="button"
                      appIconButton
                      shape="plain"
                      variant="danger"
                      class="shrink-0"
                      [attr.aria-label]="removeLabel(row)"
                      (click)="remove(row)"
                    >
                      <app-icon name="trash-2" class="h-4 w-4" />
                    </button>
                  </app-product-row>
                </li>
              }
            </ul>

            <!-- The catalog's own pager, in its words: a customer meets this
                 control on the listing first, and a second wording for the
                 same three controls would read as a different one. Buttons
                 rather than links, because the page they turn is not in the
                 URL. -->
            @if (totalPages() > 1) {
              <nav
                class="mt-8 flex items-center justify-center gap-4 text-sm"
                [attr.aria-label]="catalogText.pageStatus"
              >
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="page() === 1"
                  (click)="turnPage(-1)"
                >
                  {{ catalogText.prevPage }}
                </button>
                <span class="text-subtle">{{ pageStatus() }}</span>
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="page() === totalPages()"
                  (click)="turnPage(1)"
                >
                  {{ catalogText.nextPage }}
                </button>
              </nav>
            }
          </div>

          <!-- Capped at the column's own width when it sits under the lines
             rather than beside them: a summary of four figures stretched
             across the page is four figures with a hand's width between the
             label and the number. The cap comes off in the narrow shape,
             where the page is one column of its own width and a card set to
             three quarters of it reads as unfinished.

             Pinned once it is a column, because the lines beside it are as
             long as the cart is and the total is what the customer is editing
             them against. Clear of the header, which is pinned too — and only
             as tall as it needs to be, or a stretched column would fill the
             row and have nowhere to travel. -->
          <aside
            class="max-w-80 space-y-4 @max-[593px]/cart:max-w-none @min-[72.5rem]/cart:sticky @min-[72.5rem]/cart:top-20 @min-[72.5rem]/cart:self-start"
          >
            <!-- One card, read top to bottom: what the order is, what it will
               weigh and take up, when it is confirmed, and what it comes to.
               Splitting the total off into a card of its own made the customer
               read two boxes to answer one question. -->
            <div class="rounded-lg border border-border p-5">
              <h2 class="mb-3 font-medium">{{ text.summaryTitle }}</h2>
              <dl class="space-y-2 text-sm">
                <!-- How many lines is the cart's own answer, so it is stated
                   before the estimate and whether or not one arrives. -->
                <div class="flex items-baseline justify-between gap-4">
                  <dt class="text-subtle">{{ text.summaryLines }}</dt>
                  <dd class="text-right">{{ cart.count() }}</dd>
                </div>
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
                  <dd class="text-xl font-bold text-primary">
                    {{ subtotal() }}
                  </dd>
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
          </aside>
        </div>
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
  protected readonly changeText = this.text.changes;
  /** What moved while the cart waited (FR-CART-10) — the cart's own answer,
   * reported once per visit and put away from here. */
  protected readonly changes = this.cart.changes;
  /** Only the pager's three words: the cart turns pages the way the listing
   * does, so it says it the way the listing does. */
  protected readonly catalogText = inject(APP_TEXT).catalog;
  protected readonly rowList = PRODUCT_ROWS;
  protected readonly noteMax = CART_NOTE_MAX;

  /**
   * Debounced so a run of edits — a removal, then another — costs one call
   * rather than one each. The cart is the source of truth for *what* is in it;
   * this only ever asks what it costs now.
   */
  private readonly request = debounced(this.cart.request, 250);

  /**
   * The answer, and the cart it was an answer *to*. An edit made while a call
   * is in flight would otherwise be undone by the reply to the cart as it was
   * a moment ago: the rows are editable now, so an answer is only worth
   * folding back while it still describes what is on screen.
   */
  protected readonly preview = resource({
    params: () => ({ lines: this.request() }),
    loader: async ({ params }) =>
      params.lines.length === 0
        ? undefined
        : {
            asked: JSON.stringify(params.lines),
            value: await this.pricing.preview(params.lines),
          },
  });

  /**
   * Held across reloads: every edit re-prices the cart, and without this the
   * rows would drop back to a placeholder photo and an unnamed line for the
   * length of each call — the page blinking once per press of `+`.
   */
  private readonly held = stableValue(this.preview);

  /** The answer as the page reads it — undefined while none has arrived. */
  private readonly answer = computed(() => this.held()?.value);

  /** True while the answer on hand was computed for the cart as it stands. */
  private readonly current = computed(
    () => this.held()?.asked === JSON.stringify(this.cart.request()),
  );

  protected readonly showSkeleton = delayedLoading(this.preview.isLoading);

  /** The priced answer, indexed the way lines are identified. */
  private readonly priced = computed(() => {
    const value = this.answer();
    return new Map((value?.lines ?? []).map((line) => [line.slug, line]));
  });

  protected readonly rows = computed<CartRow[]>(() =>
    this.cart.lines().map((line) => {
      const fresh = this.priced().get(line.slug);
      return {
        key: line.slug,
        // A product preview answered no prices for is one the shop no longer
        // offers: the row keeps the last-known figures so its controls can be
        // drawn, and states none of them.
        available: fresh ? fresh.prices !== null : true,
        slug: line.slug,
        // Every part of the row from the browser's own copy, photo included:
        // preview writes what it answers back into the store, so reading the
        // answer here too would only mean redrawing the row from nothing for
        // as long as a call is in flight — which is what made a line blink on
        // every edit.
        item: {
          slug: line.slug,
          name: line.name,
          prices: line.prices,
          packaging: line.packaging,
          lineNoteEnabled: line.noteEnabled,
          lineNotePrompt: line.notePrompt,
          images: line.image ? [line.image] : [],
        },
        name: line.name,
        note: line.note,
        notePrompt: line.notePrompt ?? this.text.notePrompt,
        takesNote: line.noteEnabled,
        issues: (fresh?.issues ?? [])
          .filter((issue) => !NOTICE_ISSUES.includes(issue))
          .map((issue) => this.issueText(issue)),
        notice: this.noticeFor(fresh?.issues ?? []),
      };
    }),
  );

  /**
   * Which page of the cart is on screen (FR-CART-02), clamped on every read:
   * removing the last line of the last page leaves the customer on a page that
   * no longer exists, and a cart that answers with nothing reads as an empty
   * one.
   */
  private readonly requestedPage = signal(1);
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.rows().length / CART_PAGE_SIZE)),
  );
  protected readonly page = computed(() =>
    Math.min(this.requestedPage(), this.totalPages()),
  );

  protected readonly pageRows = computed(() => {
    const from = (this.page() - 1) * CART_PAGE_SIZE;
    return this.rows().slice(from, from + CART_PAGE_SIZE);
  });

  protected readonly pageStatus = computed(() =>
    fillText(this.catalogText.pageStatus, {
      page: this.page(),
      total: this.totalPages(),
    }),
  );

  /**
   * The ticked lines, by slug. Held here rather than on the rows so a re-priced
   * cart does not drop the ticks, and intersected with the cart on every read
   * so a line removed while ticked takes its tick with it.
   *
   * By slug, which is what identifies a line: changing a line's unit edits
   * that line, and a key carrying the unit would quietly untick the row the
   * customer just adjusted.
   */
  private readonly ticked = signal<ReadonlySet<string>>(new Set());
  protected readonly selected = computed(() => {
    const keys = new Set(this.rows().map((row) => row.key));
    return new Set([...this.ticked()].filter((key) => keys.has(key)));
  });
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly someSelected = computed(() => this.selectedCount() > 0);
  protected readonly allSelected = computed(
    () => this.rows().length > 0 && this.selectedCount() === this.rows().length,
  );

  /**
   * The cart's own arithmetic whenever the answer on hand is not an answer to
   * *this* cart — which is every moment between an edit and the call that
   * follows it. The browser holds the prices the server last quoted, so it can
   * add up a changed cart itself; waiting for the round trip would leave the
   * total a step behind the line the customer just changed.
   */
  protected readonly subtotal = computed(() =>
    formatPriceMinor(
      this.current()
        ? (this.answer()?.totalMinor ?? this.cart.totalMinor())
        : this.cart.totalMinor(),
      this.currency,
    ),
  );

  protected readonly complete = computed(() =>
    this.current()
      ? (this.answer()?.complete ?? this.cart.totalComplete())
      : this.cart.totalComplete(),
  );

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
  /**
   * The estimate to show: the one this cart was answered with, and the cart's
   * own arithmetic whenever that answer describes a cart the customer has
   * since changed — the same rule the subtotal follows, so the consignment and
   * the total never disagree about which cart they are describing.
   *
   * Neither, and the card shows its skeleton, only while a line has never been
   * priced: there is nothing to add up for it yet.
   */
  private readonly shipment = computed(() =>
    this.current()
      ? (this.answer()?.shipment ?? this.cart.estimate())
      : this.cart.estimate(),
  );

  protected readonly shipmentRows = computed<
    { label: string; value: string }[]
  >(() => {
    const shipment = this.shipment();
    if (!shipment || shipment.coveredLines === 0) return [];
    // What the consignment weighs and measures first, then how many cartons
    // that comes to: the figures a customer checks against a delivery note
    // read in that order.
    const rows: { label: string; value: string }[] = [];
    if (shipment.weight) {
      rows.push({
        label: this.text.shipmentWeight,
        value: `${shipment.weight} ${this.boxUnits.weight}`,
      });
    }
    if (shipment.volume) {
      rows.push({
        label: this.text.shipmentVolume,
        value: `${shipment.volume} ${this.boxUnits.volume}`,
      });
    }
    rows.push({
      label: this.text.shipmentCartons,
      value: String(shipment.cartons),
    });
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
    const uncovered = this.shipment()?.uncoveredLines ?? 0;
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
    //
    // Only while the answer still describes the cart, and never as a read of
    // the cart itself — folding an answer in is a write, and an effect that
    // watched what it wrote would put the reply to a stale cart back on top of
    // the edit that made it stale.
    effect(() => {
      const value = this.answer();
      if (value && this.current())
        untracked(() => this.cart.applyPreview(value));
    });
  }

  /** Turns a page, from the clamped page rather than the requested one: after
   * a removal the two can differ, and stepping off the stale figure would skip
   * a page. */
  protected turnPage(by: number): void {
    this.requestedPage.set(
      Math.min(Math.max(this.page() + by, 1), this.totalPages()),
    );
  }

  /** One line of the change summary, named by its product — the summary is
   * read above the lines it is about, so the product has to be in the
   * sentence. */
  protected changeMessage(change: CartChange): string {
    const text = this.changeText;
    if (change.kind === 'unavailable') {
      return fillText(text.unavailable, { name: change.name });
    }
    if (change.kind === 'quantity') {
      return fillText(text.quantity, { name: change.name });
    }
    if (change.kind === 'unpriced') {
      return fillText(text.unpriced, { name: change.name });
    }
    return fillText(text.price, {
      name: change.name,
      from: this.money(change.fromMinor),
      to: this.money(change.toMinor),
    });
  }

  private money(minor: number | null): string {
    return minor === null
      ? this.text.noPrice
      : formatPriceMinor(minor, this.currency);
  }

  protected removeLabel(row: CartRow): string {
    return fillText(this.text.remove, { name: row.name });
  }

  protected selectLabel(row: CartRow): string {
    return fillText(this.text.selectLine, { name: row.name });
  }

  protected isSelected(key: string): boolean {
    return this.selected().has(key);
  }

  protected toggle(key: string): void {
    const next = new Set(this.selected());
    if (!next.delete(key)) next.add(key);
    this.ticked.set(next);
  }

  /** One control for both directions: it offers the whole cart until the whole
   * cart is ticked, and gives the ticks back after that. */
  protected toggleAll(): void {
    this.ticked.set(
      this.allSelected()
        ? new Set()
        : new Set(this.rows().map((row) => row.key)),
    );
  }

  /** On `change`, which fires when the field is left — a note is written as a
   * sentence, not stored letter by letter. */
  protected onNote(row: CartRow, event: Event): void {
    this.cart.setNote(row.slug, (event.target as HTMLTextAreaElement).value);
  }

  protected remove(row: CartRow): void {
    this.cart.remove(row.slug);
  }

  /** Bulk and irreversible, so it asks first — unlike the bin on a single row,
   * where what was removed is one line the customer is looking at. */
  protected async deleteSelected(): Promise<void> {
    const keys = this.selected();
    if (keys.size === 0) return;
    const ok = await this.confirm.ask({
      heading: this.text.deleteSelectedHeading,
      message: fillText(this.text.deleteSelectedConfirm, { count: keys.size }),
      confirmLabel: this.text.deleteSelected,
      cancelLabel: this.text.cancel,
    });
    if (!ok) return;
    for (const line of this.cart.lines()) {
      if (keys.has(line.slug)) this.cart.remove(line.slug);
    }
    this.ticked.set(new Set());
  }

  /**
   * The bubble's line, where the answer carries one of the issues that are
   * feedback. Both are over by the time they can be read — the corrected line
   * is written straight back and asked about again — so they belong in a bubble
   * that says what happened rather than in the list of what is still wrong.
   *
   * The moved lens comes first where both arrived: it is the larger change, and
   * the corrected figure is standing in the field beside it either way.
   */
  private noticeFor(issues: readonly CartLineIssue[]): string | null {
    const found = NOTICE_ISSUES.find((issue) => issues.includes(issue));
    return found === undefined ? null : this.issueText(found);
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
