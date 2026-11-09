import { STOREFRONT_ORDERING_TEXT } from '../ordering-text';
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
import { CartLineIssue } from '@b2b-catalog-platform/shared/core/ordering';
import { CART_NOTE_MAX } from '@b2b-catalog-platform/shared/core/catalog';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared/platform';
import { ProductPairings } from '../../../core/catalog/buying/product-pairings';
import {
  PRODUCT_ROWS,
  ProductRow,
  RowProduct,
} from '../../catalog/ui/product-row';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { debounced } from '@b2b-catalog-platform/ui/core/debounced';
import { delayedLoading } from '../../../platform/delayed-loading';
import { usePageSeo } from '../../../platform/page-seo';
import { stableValue } from '../../../platform/stable-value';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Pagination } from '@b2b-catalog-platform/ui/lists/pagination';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { EmptyState } from '@b2b-catalog-platform/ui/content/empty-state';
import { AutoGrow } from '@b2b-catalog-platform/ui/inputs/auto-grow';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import {
  confirmRequest,
  ConfirmService,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { LastListingService } from '../../catalog/last-listing.service';
import { CartPreviewService } from './cart-preview.service';
import { useTaxStatement } from '../../../core/catalog/tax-statement';
import { OrderSummary } from '../../../core/ordering/ui/order-summary';
import { CartChange, CartService } from './cart.service';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { SummaryLayout } from '@b2b-catalog-platform/ui/content/summary-layout';
import { SHARED_CATALOG_TEXT } from '../../../core/catalog/catalog-text';
import { CATALOG_CONFIG } from '../../../core/catalog/catalog-config';

/** Lines per cart page (FR-CART-02): a row is a product row, and a long scroll
 * leaves the summary behind. Not in the URL: the cart is this browser's
 * storage. */
const CART_PAGE_SIZE = 10;

/** Issues that report what just happened rather than what is wrong, most
 * consequential first: answered once, then gone. */
const NOTICE_ISSUES: readonly CartLineIssue[] = [
  'unit-unavailable',
  'quantity-corrected',
];

/** A row: the product its controls edit, plus the line's note and preview's
 * say. `item` comes from the stored line, so controls draw on the first frame
 * and survive a failed preview. */
interface CartRow {
  /** The slug, not the unit too: a tick survives a unit change. */
  key: string;
  slug: string;
  available: boolean;
  item: RowProduct;
  name: string;
  note: string | null;
  /** The product's own wording for the note, or the app's. */
  notePrompt: string;
  takesNote: boolean;
  /** Counterparts (FR-SET-05); zero is no link. */
  pairedCount: number;
  /** The line's own rate, where the cart's lines differ (NFR-LEGAL-11). */
  taxNote: string | null;
  /** Missing cover in pieces (FR-SET-02/03), or null. A whole-cart check, so
   * from the priced answer: it trails an edit, and a late advisory beats a
   * stale one. */
  pairingShortPieces: number | null;
  issues: string[];
  /** Feedback, shown in the bubble under the stepper rather than the list. */
  notice: string | null;
}

/** The cart page (FR-CART-01/02). Lines from the browser; prices, advisories
 * and the estimate from `POST /cart/preview` on every change. Never removes a
 * line by itself. Rows are listing rows with the same buying controls, plus a
 * tick box and a bin; ticking all and deleting empties the cart. */
@Component({
  selector: 'app-cart-page',
  imports: [
    SummaryLayout,
    Notice,
    WarningNote,
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
    Pagination,
  ],
  template: `
    @if (cart.isEmpty()) {
      <h1 class="mb-4 text-2xl font-medium tracking-tight sm:text-3xl">
        {{ text.title }}
      </h1>
      <ui-empty-state [icon]="shoppingBasketIcon" [message]="text.empty">
        <a uiButton routerLink="/catalog">{{ text.emptyAction }}</a>
      </ui-empty-state>
    } @else {
      @if (cart.persistFailed()) {
        <p uiNotice tone="warning" class="mb-4">
          {{ text.storageFailed }}
        </p>
      }
      @if (preview.error()) {
        <p uiNotice tone="warning" class="mb-4">
          {{ text.loadError }}
        </p>
      }

      <ui-summary-layout track="fill">
        <div>
          <!-- What changed since last time (FR-CART-10): news, so
                 dismissible; each line also states its own state. -->
          @if (changes().length) {
            <section
              uiNotice
              tone="warning"
              class="mb-6"
              [attr.aria-label]="changeText.heading"
            >
              <div class="flex items-start justify-between gap-4">
                <h2 class="font-medium">{{ changeText.heading }}</h2>
                <button
                  type="button"
                  uiIconButton
                  class="-mt-1 -mr-1 shrink-0"
                  [attr.aria-label]="changeText.dismissAria"
                  (click)="cart.dismissChanges()"
                >
                  <ui-icon [glyph]="xIcon" />
                </button>
              </div>
              <ul class="mt-1 space-y-1">
                @for (change of changes(); track change.slug) {
                  <li>{{ changeMessage(change) }}</li>
                }
              </ul>
            </section>
          }
          <!-- In the column, so the summary starts level with the heading.
                 -->
          <h1 class="mb-4 text-2xl font-medium tracking-tight sm:text-3xl">
            {{ text.title }}
          </h1>

          <!-- Before the first row: they act on the ticks below. -->
          <div class="flex items-center gap-4 pb-2 text-sm">
            <!-- In the rows' tick column; indeterminate while some are
                   ticked. -->
            <label class="flex cursor-pointer items-center gap-2 text-accent">
              <input
                type="checkbox"
                uiCheckbox
                [checked]="allSelected()"
                [indeterminate]="someSelected() && !allSelected()"
                (change)="toggleAll()"
              />
              <!-- No underline: the box is the control, not the words. -->
              <span>
                {{ allSelected() ? text.clearSelection : text.selectAll }}
              </span>
            </label>
            <!-- Disabled, not hidden, so the list does not move on the first
                   tick. -->
            <button
              type="button"
              class="group flex cursor-pointer items-center gap-1.5
                     text-danger
                     disabled:cursor-not-allowed disabled:text-ink-disabled"
              [disabled]="selectedCount() === 0"
              (click)="deleteSelected()"
            >
              <ui-icon [glyph]="trash2Icon" class="size-4" />
              <span class="group-enabled:group-hover:underline">
                {{ text.deleteSelected }}
              </span>
            </button>
          </div>

          <ul [class]="rowList">
            <!-- By slug: a unit in the key would rebuild the row and refetch
                   its photo. -->
            @for (row of pageRows(); track row.slug) {
              <li>
                <app-product-row
                  [item]="row.item"
                  [available]="row.available"
                  [externalNote]="true"
                  [offerPairings]="false"
                  [notice]="row.notice"
                  [priceNote]="row.taxNote"
                >
                  <label
                    rowSelect
                    class="-mr-2 flex cursor-pointer shrink-0 items-start"
                  >
                    <input
                      type="checkbox"
                      uiCheckbox
                      [checked]="isSelected(row.key)"
                      [attr.aria-label]="selectLabel(row)"
                      (change)="toggle(row.key)"
                    />
                  </label>

                  @for (issue of row.issues; track issue) {
                    <ui-warning-note class="mt-1">
                      {{ issue }}
                    </ui-warning-note>
                  }

                  @if (row.takesNote || row.pairedCount > 0) {
                    <!-- Under the name: about the product, not the cart. Held
                           to the photo's bottom edge unless a long name pushes
                           them; no wider than the controls while stacked. -->
                    <div
                      class="mt-auto flex flex-col items-start gap-2 pt-2
                             @max-[47.5rem]/row:max-w-114"
                    >
                      <!-- The shop's word above the customer's note. The
                             shortfall replaces the offer: two links to one
                             panel say it twice (FR-SET-03). -->
                      @if (row.pairedCount > 0) {
                        <!-- Shifted 2px where last on the line, so its glyph
                               does not read high; a margin would be eaten by
                               the auto margin above. -->
                        <app-product-pairings
                          variant="link"
                          [class]="
                            row.takesNote
                              ? ''
                              : '@min-[47.5rem]/row:translate-y-0.5'
                          "
                          [slug]="row.slug"
                          [count]="row.pairedCount"
                          [message]="shortMessage(row.pairingShortPieces)"
                        />
                      }
                      @if (row.takesNote) {
                        <!-- The placeholder is the label. One line deep and
                               dense, matching the pill beside it. -->
                        <textarea
                          uiInput
                          uiAutoGrow
                          size="sm"
                          rows="1"
                          class="w-full"
                          [attr.maxlength]="noteMax"
                          [attr.placeholder]="row.notePrompt"
                          [attr.aria-label]="text.lineNoteAria"
                          [value]="row.note ?? ''"
                          (change)="onNote(row, $event)"
                        ></textarea>
                      }
                    </div>
                  }

                  <!-- Icon only, the name staying its accessible name; in the
                         price row's corner, away from the stepper. No disc:
                         that marks admin affordances. -->
                  <button
                    rowActions
                    type="button"
                    uiIconButton
                    variant="danger"
                    class="shrink-0"
                    [attr.aria-label]="removeLabel(row)"
                    (click)="remove(row)"
                  >
                    <ui-icon [glyph]="trash2Icon" />
                  </button>
                </app-product-row>
              </li>
            }
          </ul>

          <!-- The listing's pager and words. Buttons: the page is not in the
                 URL. -->
          <ui-pagination
            class="mt-8"
            [page]="page()"
            [totalPages]="totalPages()"
            (turned)="turnTo($event)"
          />
        </div>

        <aside summary>
          <app-order-summary
            [lineCount]="cart.count()"
            [subtotalMinor]="subtotalMinor()"
            [complete]="complete()"
            [shipment]="shipment()"
            [loading]="showSkeleton()"
            [taxRates]="cart.taxRates()"
          />

          <!-- Over the button it bears on (FR-SET-03/04), where a scrolling
                 customer reads it. -->
          @if (pairingSummary(); as summary) {
            <ui-warning-note class="mt-3">{{ summary }}</ui-warning-note>
          }

          <!-- Full width: in the narrow shape this card is the page. -->
          @if (pairingsBlock()) {
            <!-- Disabled, with the reason above, rather than a refusal on the
                   next page. The API refuses it too. -->
            <button uiButton type="button" disabled class="mt-5 w-full">
              {{ text.checkout }}
            </button>
          } @else {
            <a uiButton routerLink="/checkout" class="mt-5 w-full">
              {{ text.checkout }}
            </a>
          }
          <!-- Back to the last listing, with its page and filters. -->
          <a
            uiButton
            variant="ghost"
            class="mt-2 w-full"
            [routerLink]="continueShoppingUrl"
          >
            {{ text.continueShopping }}
          </a>
        </aside>
      </ui-summary-layout>
    }
  `,
})
export class CartPage {
  protected readonly shoppingBasketIcon = shoppingBasketIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly xIcon = xIcon;
  protected readonly cart = inject(CartService);
  private readonly pricing = inject(CartPreviewService);
  private readonly lastListing = inject(LastListingService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly catalogConfig = inject(CATALOG_CONFIG);
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  private readonly boxUnits = this.catalogConfig.boxUnits;

  protected readonly text = inject(STOREFRONT_ORDERING_TEXT).cart;

  private readonly buyText = inject(SHARED_CATALOG_TEXT).buying;
  protected readonly changeText = this.text.changes;
  protected readonly changes = this.cart.changes;
  /** The listing's pager words. */
  protected readonly rowList = PRODUCT_ROWS;
  protected readonly pairingText = this.text.pairing;
  private readonly pieceUnit = inject(SHARED_CATALOG_TEXT).units.piece;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  /** Whether an unsatisfied pairing refuses checkout here (FR-SET-04). */
  private readonly pairingsEnforced = this.catalogConfig.pairingsEnforced;

  /** A parsed tree: routerLink would encode a string's `?` into the path. */
  protected readonly continueShoppingUrl = this.router.parseUrl(
    this.lastListing.url(),
  );

  protected readonly noteMax = CART_NOTE_MAX;

  /** Debounced, so a run of edits costs one call. */
  private readonly request = debounced(this.cart.request, 250);

  /** The answer and the cart it answers: folded back only while it still
   * describes what is on screen, or a reply would undo a newer edit. */
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

  /** Held across reloads, or each `+` would blank the rows for a call. */
  private readonly held = stableValue(this.preview);

  /** Undefined until an answer arrives. */
  private readonly answer = computed(() => this.held()?.value);

  private readonly current = computed(
    () => this.held()?.asked === JSON.stringify(this.cart.request()),
  );

  protected readonly showSkeleton = delayedLoading(this.preview.isLoading);

  /** By slug. */
  private readonly priced = computed(() => {
    const value = this.answer();
    return new Map((value?.lines ?? []).map((line) => [line.slug, line]));
  });

  private readonly tax = useTaxStatement();
  /** Lines state rates only once they differ. */
  private readonly perLineRates = computed(() =>
    this.tax.perLine(this.cart.taxRates()),
  );

  protected readonly rows = computed<CartRow[]>(() =>
    this.cart.lines().map((line) => {
      const fresh = this.priced().get(line.slug);
      return {
        key: line.slug,
        // No prices answered means no longer offered: the row keeps the last
        // figures for its controls and states none. Before an answer, the last
        // one's verdict holds.
        available: fresh ? fresh.prices !== null : line.available,
        slug: line.slug,
        // From the browser's copy: preview writes back to the store, and
        // reading the answer would blank the row per call.
        item: {
          slug: line.slug,
          name: line.name,
          prices: line.prices,
          packaging: line.packaging,
          // The badge, and controls out of use on an empty shelf (FR-
          // STOCK-03/04).
          availability: line.availability,
          lineNoteEnabled: line.noteEnabled,
          lineNotePrompt: line.notePrompt,
          pairedCount: line.pairedCount,
          parts: line.parts,
          // Its variant pictures (FR-CAT-13), else the photo it was added with.
          images: line.images.length
            ? line.images
            : line.image
              ? [{ ...line.image, variant: null }]
              : [],
          variants: line.variants,
        },
        name: line.name,
        note: line.note,
        notePrompt: line.notePrompt ?? this.buyText.notePrompt,
        takesNote: line.noteEnabled,
        pairedCount: line.pairedCount,
        taxNote:
          this.perLineRates() && line.available && line.taxRate != null
            ? this.tax.line(line.taxRate)
            : null,
        // From the stored copy, so a reload states it before the call.
        pairingShortPieces: line.pairingShortPieces,
        // So a withdrawn line explains its missing price before an answer.
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

  /** Short lines (FR-SET-03), counted from the rows so the card cannot
   * disagree. */
  private readonly shortLines = computed(
    () => this.rows().filter((row) => row.pairingShortPieces !== null).length,
  );

  protected readonly pairingsBlock = computed(
    () => this.pairingsEnforced && this.shortLines() > 0,
  );

  /** Advisory by default; enforced wording goes with a disabled button. */
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

  /** The shortfall in pieces, or null. Two halves: only the first is the link,
   * and the text decides the break. */
  protected shortMessage(
    shortPieces: number | null,
  ): { link: string; rest: string } | null {
    if (shortPieces === null) return null;
    const filled = { count: shortPieces, unit: this.pieceUnit };
    return {
      link: fillText(this.pairingText.shortAction, filled),
      rest: fillText(this.pairingText.shortReason, filled),
    };
  }

  /** Clamped on every read: removing the last line of the last page leaves a
   * page that no longer exists. */
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

  /** Ticked slugs, kept here so re-pricing keeps them and intersected with the
   * cart so a removed line drops its tick. By slug, so a unit change does not
   * untick. */
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

  /** The cart's own sum between an edit and its answer, from the last quoted
   * prices. */
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

  /** The answer's estimate, or the cart's own after an edit, by the subtotal's
   * rule. Neither (a skeleton) while a line was never priced. */
  protected readonly shipment = computed(
    () =>
      (this.current()
        ? (this.answer()?.shipment ?? this.cart.estimate())
        : this.cart.estimate()) ?? null,
  );

  constructor() {
    // Not indexable: every visitor's cart differs.
    usePageSeo({ name: () => this.text.title, noindex: true });
    // A fresh answer becomes the stored baseline (FR-CART-10). Only while it
    // describes the cart, and untracked: watching its own write would put a
    // stale reply over the edit.
    effect(() => {
      const value = this.answer();
      if (value && this.current())
        untracked(() => this.cart.applyPreview(value));
    });
  }

  /** From the clamped page: after a removal the requested one may be stale. */
  protected turnTo(page: number): void {
    this.requestedPage.set(page);
  }

  /** Named by its product: the summary sits above the lines. */
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
      ? this.buyText.noPrice
      : formatMoneyMinor(minor, this.currency);
  }

  protected removeLabel(row: CartRow): string {
    return fillText(this.text.removeAria, { name: row.name });
  }

  protected selectLabel(row: CartRow): string {
    return fillText(this.text.selectLineAria, { name: row.name });
  }

  protected isSelected(key: string): boolean {
    return this.selected().has(key);
  }

  protected toggle(key: string): void {
    const next = new Set(this.selected());
    if (!next.delete(key)) next.add(key);
    this.ticked.set(next);
  }

  /** Ticks all until all are ticked, then clears. */
  protected toggleAll(): void {
    this.ticked.set(
      this.allSelected()
        ? new Set()
        : new Set(this.rows().map((row) => row.key)),
    );
  }

  /** On `change`, when the field is left. */
  protected onNote(row: CartRow, event: Event): void {
    this.cart.setNote(row.slug, (event.target as HTMLTextAreaElement).value);
  }

  protected remove(row: CartRow): void {
    this.cart.remove(row.slug);
  }

  /** Bulk and irreversible, so it asks; the single bin does not. */
  protected async deleteSelected(): Promise<void> {
    const keys = this.selected();
    if (keys.size === 0) return;
    const ok = await this.confirm.ask({
      ...confirmRequest(
        this.text.deleteSelectedConfirm,
        this.actionText.cancel,
      ),
      message: fillText(this.text.deleteSelectedConfirm.message, {
        count: keys.size,
      }),
    });
    if (!ok) return;
    for (const line of this.cart.lines()) {
      if (keys.has(line.slug)) this.cart.remove(line.slug);
    }
    this.ticked.set(new Set());
  }

  /** The bubble's line for a feedback issue: already corrected, so news, not a
   * state. A moved lens comes first. */
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
