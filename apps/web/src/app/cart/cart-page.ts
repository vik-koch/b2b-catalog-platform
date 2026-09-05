import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CART_NOTE_MAX,
  CartLineIssue,
  fillText,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../catalog/price';
import { ProductPairings } from '../catalog/product-pairings';
import { PRODUCT_ROWS, ProductRow, RowProduct } from '../catalog/product-row';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { debounced } from '../core/debounced';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { stableValue } from '../core/stable-value';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { EmptyState } from '../ui/empty-state';
import { AutoGrow } from '../ui/auto-grow';
import { Input } from '../ui/input';
import { ConfirmService } from '../ui/confirm.service';
import { IconButton } from '../ui/icon-button';
import { Icon } from '../ui/icons/icon';
import { LastListingService } from '../catalog/last-listing.service';
import { CartPreviewService } from './cart-preview.service';
import { OrderSummary } from './order-summary';
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
  /** How many products this line's product is sold together with (FR-SET-05);
   * zero is no link. */
  pairedCount: number;
  /**
   * How many pieces of cover this line is missing (FR-SET-02/03), or null
   * where it is satisfied.
   *
   * From the priced answer rather than the browser's own copy, unlike
   * everything else the row draws: the check is over the whole cart at once and
   * a line cannot answer it alone. So it says nothing until a preview has, and
   * it follows an edit a beat behind — which is the right way round for an
   * advisory, since a stale one is worse than a late one.
   */
  pairingShortPieces: number | null;
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
    EmptyState,
    Icon,
    IconButton,
    Input,
    OrderSummary,
    ProductPairings,
    ProductRow,
    RouterLink,
  ],
  template: `
    @if (cart.isEmpty()) {
      <h1 class="mb-6 text-2xl font-medium tracking-tight sm:text-3xl">
        {{ text.title }}
      </h1>
      <!-- The same panel the account draws with no orders on it and the
           checkout draws once one has been sent: three screens that say
           "there is nothing here, here is where to go" should not be three
           different screens. -->
      <app-empty-state icon="shopping-basket" [message]="text.empty">
        <a appButton routerLink="/catalog">{{ text.emptyAction }}</a>
      </app-empty-state>
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
              class="-mt-1 -mr-1 shrink-0"
              [attr.aria-label]="changeText.dismiss"
              (click)="cart.dismissChanges()"
            >
              <app-icon name="close" />
            </button>
          </div>
          <ul class="mt-1 space-y-1">
            @for (change of changes(); track change.slug) {
              <li>{{ changeMessage(change) }}</li>
            }
          </ul>
        </section>
      }

      <!-- The card moves out to the right exactly where the lines can keep
           the shape they have without it: LISTING_NARROW, plus the card's
           20rem and the gap between them. A card beside lines drawn as though
           there were no room for it is the one arrangement that reads as a
           mistake, and any figure above this one buys nothing — the photo
           takes up the slack by itself. Under the card, the lines take the
           whole page rather than lining up with a card they are no longer
           beside.

           Measured on the page rather than on the window: the frame's padding
           and the scrollbar are most of a column of controls, and the media
           query cannot see either. -->
      <div class="@container/cart">
        <div class="grid gap-8 @min-[63.75rem]/cart:grid-cols-[1fr_20rem]">
          <div>
            <!-- In the column, not above the grid: the summary beside it then
                 starts level with the heading, and the same card sits at the
                 same height on the cart, the checkout and the read-back. -->
            <h1 class="mb-6 text-2xl font-medium tracking-tight sm:text-3xl">
              {{ text.title }}
            </h1>

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
                    [offerPairings]="false"
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

                    @if (
                      row.takesNote ||
                      row.pairedCount > 0 ||
                      row.pairingShortPieces
                    ) {
                      <!-- Under the name, in the name's own column: both of
                         these are about this product, and a field the width of
                         the whole line read as being about the cart.

                         The pair drops to the bottom of that column, which is
                         the photo's own bottom edge — a short name leaves them
                         there rather than hanging them under one line of text.
                         A name long enough to need the room pushes them down
                         instead. Whichever of the two a line has ends up on
                         the same edge as its neighbours'.

                         No wider than the controls they stand over while the
                         line is stacked: a field that ran past their right
                         edge read as belonging to the row, not to the column
                         it is in. -->
                      <div
                        class="mt-auto flex flex-col items-start gap-2 pt-2 @max-[47.5rem]/row:max-w-[28.5rem]"
                      >
                        <!-- Above the note, because it is something the shop
                           says about the product and the note is something the
                           customer writes about the line. -->
                        <!-- What this line is short of, and then the way to
                           answer it: the sentence names the amount and the
                           link opens the products that would cover it, which
                           is the whole of FR-SET-03 in two lines. -->
                        @if (row.pairingShortPieces; as short) {
                          <p class="text-sm text-amber-700">
                            {{ shortMessage(short) }}
                          </p>
                        }
                        @if (row.pairedCount > 0) {
                          <app-product-pairings
                            variant="link"
                            [slug]="row.slug"
                            [count]="row.pairedCount"
                          />
                        }
                        @if (row.takesNote) {
                          <!-- The placeholder is the product's question, so it
                             needs no label. A text area, as everywhere else a
                             sentence is typed, one line deep until the
                             customer drags it taller — the height of the pill
                             of segments across from it, and dense to match:
                             the row is a line of small controls, and a
                             full-sized field among them reads as the thing to
                             fill in. -->
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
                        }
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
                      variant="danger"
                      class="shrink-0"
                      [attr.aria-label]="removeLabel(row)"
                      (click)="remove(row)"
                    >
                      <app-icon name="trash-2" />
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
             row and have nowhere to travel.

             The same measure as the column it drops under, which is what the
             checkout gives it too: stacked, the card is the page, and three
             pages that agree about the card should agree about its width. -->
          <aside
            class="max-w-xl @min-[63.75rem]/cart:mt-9 @min-[63.75rem]/cart:sticky @min-[63.75rem]/cart:top-20 @min-[63.75rem]/cart:self-start"
          >
            <app-order-summary
              [lineCount]="cart.count()"
              [subtotalMinor]="subtotalMinor()"
              [complete]="complete()"
              [shipment]="shipment()"
              [loading]="showSkeleton()"
            />

            <!-- Directly over the button it bears on (FR-SET-03/04), where
                 the incomplete-total line already stands: a customer scrolling
                 a long cart to check out reads this card, and an advisory
                 further up the page is one they scrolled past. -->
            @if (pairingSummary(); as summary) {
              <p class="mt-3 text-sm text-amber-700">{{ summary }}</p>
            }

            <!-- Inside the summary card, under the figure they act on: the
                 total is what somebody decides to check out against. Full
                 width, because in the narrow shape this card is the page. -->
            @if (pairingsBlock()) {
              <!-- A disabled button rather than a link that refuses on the
                   next page: the reason is on screen right above it, and
                   sending somebody to a form to be turned away there is a
                   worse way of saying the same thing. The API refuses it too
                   — this is not what makes it a rule. -->
              <button appButton type="button" disabled class="mt-5 w-full">
                {{ text.checkout }}
              </button>
            } @else {
              <a appButton routerLink="/checkout" class="mt-5 w-full">
                {{ text.checkout }}
              </a>
            }
            <!-- Back to the shelf the visitor was standing at, with the
                 category, page and filters it was carrying. -->
            <a
              appButton
              variant="ghost"
              class="mt-2 w-full"
              [routerLink]="continueShoppingUrl"
            >
              {{ text.continueShopping }}
            </a>
          </aside>
        </div>
      </div>
    }
  `,
})
export class CartPage {
  protected readonly cart = inject(CartService);
  private readonly pricing = inject(CartPreviewService);
  private readonly lastListing = inject(LastListingService);
  private readonly router = inject(Router);
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
  protected readonly pairingText = this.text.pairing;
  /** The piece abbreviation, for the sentence that names a shortfall. */
  private readonly pieceUnit = inject(APP_TEXT).catalog.units.piece;
  /** Whether an unsatisfied pairing refuses checkout here (FR-SET-04). */
  private readonly pairingsEnforced = this.catalogConfig.pairingsEnforced;

  /**
   * Where "continue shopping" goes. A parsed tree rather than the string:
   * a remembered listing carries the page and the filters in its query, and
   * routerLink given a string would encode the `?` into the path.
   */
  protected readonly continueShoppingUrl = this.router.parseUrl(
    this.lastListing.url(),
  );

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
        // drawn, and states none of them. Until an answer arrives, what the
        // last one said — a line already known to be withdrawn must not show
        // its old price again for the length of a call.
        available: fresh ? fresh.prices !== null : line.available,
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
          // The badge the row wears, and what takes its controls out of use
          // where the shelf is empty (FR-STOCK-03/04).
          availability: line.availability,
          lineNoteEnabled: line.noteEnabled,
          lineNotePrompt: line.notePrompt,
          pairedCount: line.pairedCount,
          images: line.image ? [line.image] : [],
        },
        name: line.name,
        note: line.note,
        notePrompt: line.notePrompt ?? this.text.notePrompt,
        takesNote: line.noteEnabled,
        pairedCount: line.pairedCount,
        pairingShortPieces: fresh?.pairingShortPieces ?? null,
        // Before an answer arrives, the one thing the browser wrote down about
        // the line's state — so a withdrawn line says why it is priceless
        // rather than showing "on request" with nothing to explain it.
        issues: fresh
          ? fresh.issues
              .filter((issue) => !NOTICE_ISSUES.includes(issue))
              .map((issue) => this.issueText(issue))
          : line.available
            ? []
            : [this.issueText('unavailable')],
        notice: this.noticeFor(fresh?.issues ?? []),
      };
    }),
  );

  /**
   * The lines that are short of what they are sold with (FR-SET-03). Counted
   * from the rows rather than kept separately: they are the same figures the
   * lines are already stating, and a card that could disagree with the list
   * beside it would be worth nothing.
   */
  private readonly shortLines = computed(
    () => this.rows().filter((row) => row.pairingShortPieces !== null).length,
  );

  /** True where this deployment refuses an unsatisfied cart (FR-SET-04) and
   * this cart is one. */
  protected readonly pairingsBlock = computed(
    () => this.pairingsEnforced && this.shortLines() > 0,
  );

  /** What the order card says about it, or null where there is nothing to
   * say. Advisory by default; the enforced wording is the one that goes with
   * a button that cannot be pressed. */
  protected readonly pairingSummary = computed(() => {
    const count = this.shortLines();
    if (count === 0) return null;
    return fillText(
      this.pairingsEnforced
        ? this.pairingText.summaryEnforced
        : this.pairingText.summary,
      { count },
    );
  });

  /** What one line is short, in pieces — the unit every quantity here is a
   * count of, whichever lens the line is being read in. */
  protected shortMessage(shortPieces: number): string {
    return fillText(this.pairingText.short, {
      count: shortPieces,
      unit: this.pieceUnit,
    });
  }

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
  protected readonly subtotalMinor = computed(() =>
    this.current()
      ? (this.answer()?.totalMinor ?? this.cart.totalMinor())
      : this.cart.totalMinor(),
  );

  protected readonly complete = computed(() =>
    this.current()
      ? (this.answer()?.complete ?? this.cart.totalComplete())
      : this.cart.totalComplete(),
  );

  /**
   * The estimate to show: the one this cart was answered with, and the cart's
   * own arithmetic whenever that answer describes a cart the customer has
   * since changed — the same rule the subtotal follows, so the consignment and
   * the total never disagree about which cart they are describing.
   *
   * Neither, and the card shows its skeleton, only while a line has never been
   * priced: there is nothing to add up for it yet.
   */
  protected readonly shipment = computed(
    () =>
      (this.current()
        ? (this.answer()?.shipment ?? this.cart.estimate())
        : this.cart.estimate()) ?? null,
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
    if (change.kind === 'out-of-stock') {
      return fillText(text.outOfStock, { name: change.name });
    }
    if (change.kind === 'back-in-stock') {
      return fillText(text.backInStock, { name: change.name });
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
    if (issue === 'out-of-stock') return issues.outOfStock;
    return issues.unavailable;
  }
}
