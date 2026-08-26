import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  CART_NOTE_MAX,
  CatalogImage,
  convertUnitQuantity,
  correctPieceQuantity,
  exactLineTotal,
  ProductPackagingInfo,
  ProductUnit,
  UnitPrices,
} from '@b2b-catalog-platform/shared';
import { CartAddResult, CartService } from '../cart/cart.service';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { fillText } from '../core/fill-text';
import { AutoGrow } from '../ui/auto-grow';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Icon } from '../ui/icons/icon';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { NumericField } from '../ui/numeric-field';
import { Popover } from '../ui/popover';
import { SEGMENTED_GROUP, SegmentState, segmentClass } from '../ui/segmented';
import { formatPriceMinor } from './price';
import { ProductUnitFacts } from './product-unit-facts';
import { useProductUnits } from './product-units-view';

/** How long a statement stays on screen before it fades away. */
const NOTICE_MS = 5000;

/** Radios group by name across the whole document, so every instance needs its
 * own — a grid renders dozens of these side by side. */
let nextGroupId = 0;

/**
 * What a bubble is saying, and which control it is saying it about. One at a
 * time: two bubbles open over one small block is noise, not information.
 */
interface Popup {
  /** `quantity`, `remove`, `note`, or the unit whose segment was pressed. */
  at: 'quantity' | 'remove' | 'note' | ProductUnit;
  message: string;
}

/** The little a grid tile and a product page have to agree on to sell
 * something: what it is called, what it costs and how it is packed. */
export interface BuyableProduct {
  slug: string;
  name: string;
  prices: UnitPrices;
  packaging: ProductPackagingInfo;
  /** Whether this product's line takes a free-text note (FR-CART-08), and its
   * own wording for the question. */
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
}

/**
 * Choosing a unit, a quantity, and putting the product in the cart
 * (FR-UNIT-07, FR-CART-01) — one component for the grid tile and the product
 * page, because the two are the same decision taken at different magnifications
 * and a customer who learns it on a card must find it unchanged on the page.
 *
 * It reads top to bottom in the order the decision is taken: what one costs,
 * which unit, how many, then whatever the caller projects (the packaging facts,
 * a line note), then the action. What the *selection* would cost is not among
 * them — it is the price and the quantity multiplied, and once the line is in
 * the cart the button's own place says it exactly.
 *
 * Every part is the full width of the block, and the three units are always in
 * the same three places, so a grid of these lines up column by column. A list
 * turns the same blocks on their side (`layout="row"`) without reordering the
 * decisions: unit and quantity in one column, price and action in the next.
 *
 * Four rules are encoded rather than stated:
 *
 * - **One price, the chosen one.** With a unit selector present, listing every
 *   unit's price beside it asks the customer to match figures to segments. The
 *   headline is the price of the unit that is selected, and changing the
 *   selection changes it.
 * - **A product is one line.** Once it is in the cart these controls edit that
 *   line rather than describing a second one: the stepper changes the cart's
 *   quantity, the selector changes the cart's unit, and the button is replaced
 *   by what the line now costs. There is nothing to confirm and nowhere to send
 *   the customer — the change they made is the feedback.
 * - **A quantity is corrected upwards, never refused,** and the correction is
 *   stated in a bubble that goes away by itself. It is feedback on something
 *   already done, not an error waiting to be cleared.
 * - **Down past the minimum means "take it out",** which is the one thing here
 *   worth asking about first. Everything the controls have to say arrives in
 *   the same bubble under the control it is about — a segment that is not sold,
 *   a corrected number, the question — and anywhere else the customer clicks
 *   dismisses it. For the question, that is "no".
 */
@Component({
  selector: 'app-product-buy-controls',
  imports: [
    AutoGrow,
    Button,
    FieldLabel,
    Icon,
    IconButton,
    Input,
    NgTemplateOutlet,
    NumericField,
    Popover,
    ProductUnitFacts,
  ],
  host: { class: 'block' },
  template: `
    <!-- Fragments, so the two arrangements are two orders of the same five
         blocks rather than two copies of them. -->
    <ng-template #priceBlock>
      <!-- The note shares the price's line rather than getting one of its own:
           it is the only other thing that belongs to the line as a whole, and
           a card has no row to spare for a control most products never show. -->
      <div class="flex items-center justify-between gap-2">
        <p [class]="priceClass()">
          {{ price() }}
          <span [class]="priceUnitClass()">{{ priceUnit() }}</span>
        </p>

        <!-- Whatever the caller does *to the line* goes at this end of the
             price row — the cart's bin — and it is the only place a control
             belongs that is neither a choice nor the action. -->
        <ng-content select="[priceAction]" />

        @if (asksForNote()) {
          <div class="relative flex">
            <button
              type="button"
              appIconButton
              shape="plain"
              [variant]="hasNote() ? 'marked' : 'default'"
              [attr.aria-label]="hasNote() ? text.noteEdit : text.noteAdd"
              [title]="hasNote() ? text.noteEdit : text.noteAdd"
              (click)="openNote()"
            >
              <!-- The glyph says whether anything is written. -->
              <app-icon
                [name]="
                  hasNote() ? 'message-circle-check' : 'message-circle-plus'
                "
                class="h-4 w-4"
              />
            </button>

            @if (popup(); as open) {
              @if (open.at === 'note') {
                <!-- Upwards: everything else on this block is below the price
                     line, and a bubble over the stepper and the button is one
                     the customer has to clear before buying. -->
                <app-popover
                  align="end"
                  placement="above"
                  [roomy]="true"
                  (dismissed)="dismiss()"
                >
                  <!-- The product's question is the field's placeholder, not
                       a line under it: it is what to write, and it is read
                       while the field is empty — which is the only time it has
                       anything to say. -->
                  <label class="block">
                    <span appFieldLabel>{{ text.noteLabel }}</span>
                    <textarea
                      appInput
                      appAutoGrow
                      rows="3"
                      class="w-full"
                      [attr.maxlength]="noteMax"
                      [attr.placeholder]="notePrompt()"
                      [value]="ownNote()"
                      (input)="onNoteInput($event)"
                      (blur)="saveNote()"
                    ></textarea>
                  </label>
                </app-popover>
              }
            }
          </div>
        }
      </div>
    </ng-template>

    <!-- All three units, always, in the same three places: the segments divide
         the row in proportion to their labels, and a unit the product is not
         sold in is shown greyed and says so when pressed. -->
    <ng-template #unitsBlock>
      <div
        role="radiogroup"
        [attr.aria-label]="text.unitLabel"
        [class]="group()"
      >
        @for (option of options(); track option.unit) {
          <!-- Flex, so the segment inside fills the share of the row it was
               given: its own width plus an equal part of what is left over. -->
          <div class="relative flex flex-auto">
            @if (option.available) {
              <label [class]="segment(option.unit)">
                <input
                  type="radio"
                  [name]="radioName"
                  class="sr-only"
                  [value]="option.unit"
                  [checked]="option.unit === unit()"
                  (change)="chooseUnit(option.unit)"
                />
                {{ option.label }}
              </label>
            } @else {
              <!-- A button, not a disabled radio: it is not selectable, but it
                   is pressable, and what it does is say why. A disabled control
                   would take itself out of the tab order and answer nothing. -->
              <button
                type="button"
                [class]="segment(option.unit) + ' w-full'"
                (click)="explainUnit(option.unit)"
              >
                {{ option.label }}
              </button>
            }

            @if (popup(); as open) {
              @if (open.at === option.unit) {
                <app-popover [duration]="noticeMs" (dismissed)="dismiss()">
                  <p role="status">{{ open.message }}</p>
                </app-popover>
              }
            }
          </div>
        }
      </div>
    </ng-template>

    <!-- One control, not three: the steppers are welded to the field's ends, so
         it reads as a single number input rather than as a row of buttons that
         happen to sit nearby. Square ends, and the field takes the rest. -->
    <ng-template #stepperBlock>
      <div [class]="stepperGroup()">
        <div class="relative flex">
          <button
            type="button"
            [class]="stepperButton() + ' rounded-l-md'"
            [attr.aria-label]="text.decrease"
            (click)="step(-1)"
          >
            <app-icon name="minus" class="h-4 w-4" />
          </button>

          @if (popup(); as open) {
            @if (open.at === 'remove') {
              <app-popover align="start" (dismissed)="dismiss()">
                <p>{{ open.message }}</p>
                <div class="mt-2 flex gap-2">
                  <button
                    type="button"
                    appButton
                    variant="danger"
                    size="sm"
                    class="flex-1"
                    (click)="confirmRemove()"
                  >
                    {{ text.removeYes }}
                  </button>
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    size="sm"
                    class="flex-1"
                    (click)="dismiss()"
                  >
                    {{ text.removeNo }}
                  </button>
                </div>
              </app-popover>
            }
          }
        </div>

        <div class="relative flex flex-1">
          <input
            appInput
            appNumericField="integer"
            inputmode="numeric"
            [class]="quantityField()"
            [attr.aria-label]="text.quantityLabel"
            [value]="quantity()"
            (input)="onQuantityInput($event)"
            (blur)="onQuantityBlur($event)"
          />

          @if (popup(); as open) {
            @if (open.at === 'quantity') {
              <app-popover [duration]="noticeMs" (dismissed)="dismiss()">
                <p role="status">{{ open.message }}</p>
              </app-popover>
            }
          }
        </div>

        <button
          type="button"
          [class]="stepperButton() + ' rounded-r-md'"
          [attr.aria-label]="text.increase"
          (click)="step(1)"
        >
          <app-icon name="plus" class="h-4 w-4" />
        </button>
      </div>
    </ng-template>

    <ng-template #actionBlock>
      @if (canAdd()) {
        @if (inCart()) {
          <!-- A field, not a button: it is the same size and in the same place
               as the one it replaced, so the row does not move, but there is
               nothing left to press — the stepper is what changes the line. -->
          <p [class]="addedField()" role="status">{{ addedMessage() }}</p>
        } @else {
          <button type="button" appButton [class]="addButton()" (click)="add()">
            <app-icon name="shopping-basket" class="mr-2 h-4 w-4" />
            {{ text.add }}
          </button>
        }

        @if (feedback() === 'full') {
          <p class="mt-2 text-sm text-amber-700" role="status">
            {{ text.full }}
          </p>
        }
      }
    </ng-template>

    <!-- Projected once, placed by whichever arrangement is drawn. -->
    <ng-template #extras><ng-content /></ng-template>

    @if (row()) {
      <!-- One set of blocks, two arrangements, chosen by how much width the
           row actually has (a container query, not the viewport: a listing
           beside a filter panel is narrow at any window size).

           Narrow, the blocks read in the order a card reads them — price,
           unit, quantity, the facts, the button — because that is the order
           the decision is taken in and the customer already knows it. Wide,
           the same blocks fall into two columns without moving in the DOM, so
           what a screen reader and the tab key see never changes. -->
      <div [class]="rowGrid">
        <div [class]="cell.price">
          <ng-container [ngTemplateOutlet]="priceBlock" />
        </div>
        <div [class]="cell.units">
          <ng-container [ngTemplateOutlet]="unitsBlock" />
        </div>
        <div [class]="cell.stepper">
          <ng-container [ngTemplateOutlet]="stepperBlock" />
        </div>
        <div [class]="cell.minimum">
          <app-product-unit-facts
            show="minimum"
            [packagingInfo]="packaging()"
          />
        </div>
        <div [class]="cell.packaging">
          <app-product-unit-facts
            show="packaging"
            [packagingInfo]="packaging()"
          />
        </div>
        <div [class]="cell.action">
          <ng-container [ngTemplateOutlet]="actionBlock" />
        </div>
      </div>
    } @else {
      <ng-container [ngTemplateOutlet]="priceBlock" />
      <ng-container [ngTemplateOutlet]="unitsBlock" />
      <ng-container [ngTemplateOutlet]="stepperBlock" />
      <ng-container [ngTemplateOutlet]="extras" />
      <ng-container [ngTemplateOutlet]="actionBlock" />
    }
  `,
})
export class ProductBuyControls {
  private readonly cart = inject(CartService);
  private readonly units = useProductUnits();
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  protected readonly text = inject(APP_TEXT).cart;
  private readonly unitText = inject(APP_TEXT).catalog.units;
  protected readonly noticeMs = NOTICE_MS;

  readonly item = input.required<BuyableProduct>();
  /** The note to record with the line, where the caller offers one. */
  readonly note = input<string | null>(null);
  /**
   * The product's first photo, recorded with the line. The cart is drawn from
   * the browser's own copy before anything is asked of the server, and a row
   * that had to wait for the pricing call to learn its photo showed a
   * placeholder on every load and every change of unit.
   */
  readonly image = input<CatalogImage | null>(null);
  /**
   * True where the caller shows a note field of its own — the product page's
   * buying block, and the cart, which writes one under every line. The
   * controls then record what they are given and offer no button: two ways to
   * write the same note, side by side, is one too many.
   */
  readonly externalNote = input(false);
  /** False in the product editor's live preview: the block is there to show
   * what a visitor will see, not to fill a manager's own cart. */
  readonly canAdd = input(true);
  /** Card-sized rather than page-sized: smaller type and a denser stepper. */
  readonly compact = input(false);
  /**
   * False for a cart line whose product the shop can no longer price — it has
   * been withdrawn, or repackaged out of its stored basis. The controls stay
   * usable, but they state no figure: the last price the browser saw is not
   * one the shop is still offering, and the row says why beside them.
   */
  readonly available = input(true);
  /**
   * `stack` reads top to bottom down a card or a product page; `row` lays the
   * same blocks out as two columns of a product line — the unit, the quantity
   * and the minimum in one, the price, the action and the packaging in the
   * other. Same controls, same order of decisions, turned on its side.
   */
  readonly layout = input<'stack' | 'row'>('stack');
  protected readonly row = computed(() => this.layout() === 'row');

  protected readonly radioName = `unit-${nextGroupId++}`;
  protected readonly noteMax = CART_NOTE_MAX;

  protected readonly packaging = computed(() => this.item().packaging);
  protected readonly options = computed(() =>
    this.units.unitOptions(this.packaging()),
  );

  /** The cart's line for this product, in whatever unit — the controls are a
   * view of it wherever there is one. */
  protected readonly line = computed(() => this.cart.lineFor(this.item().slug));
  protected readonly inCart = computed(() => this.line() !== undefined);

  /**
   * The piece is the default — the smallest commitment, and the one unit every
   * product is sold in. The choice resets when the product does: a unit chosen
   * on one product means nothing on the next.
   */
  private readonly chosenUnit = linkedSignal<string, ProductUnit>({
    source: () => this.item().slug,
    computation: () => 'piece',
  });

  /** Reset with the product, not with the unit: switching unit converts the
   * quantity rather than restarting it. */
  private readonly chosenQuantity = linkedSignal<string, number>({
    source: () => this.item().slug,
    computation: () => this.item().packaging.minPieceQty,
  });

  protected readonly unit = computed(
    () => this.line()?.unit ?? this.chosenUnit(),
  );
  protected readonly quantity = computed(
    () => this.line()?.quantity ?? this.chosenQuantity(),
  );

  /**
   * The note as these controls hold it, where nothing else does. Seeded from
   * the cart's line so the bubble opens on what was written, and reset when
   * the product changes — a note belongs to the line it was typed for.
   */
  protected readonly ownNote = linkedSignal<string, string>({
    source: () => this.item().slug,
    computation: () => this.line()?.note ?? '',
  });

  /** Whether these controls own the note: the product takes one and no caller
   * has offered a field for it. */
  protected readonly asksForNote = computed(
    () => this.item().lineNoteEnabled && !this.externalNote(),
  );
  protected readonly hasNote = computed(
    () => (this.effectiveNote() ?? '').trim() !== '',
  );
  protected readonly notePrompt = computed(
    () => this.item().lineNotePrompt ?? this.text.notePrompt,
  );

  protected readonly popup = signal<Popup | null>(null);
  /** What the last add did, if anything — cleared by any further edit, so it
   * never describes a selection that has since changed. */
  protected readonly feedback = signal<CartAddResult | null>(null);

  private readonly priceRow = computed(() =>
    this.units.priceRow(this.item().prices, this.unit()),
  );
  protected readonly price = computed(() =>
    this.available()
      ? (this.priceRow()?.price ?? this.text.noPrice)
      : this.text.noPrice,
  );
  protected readonly priceUnit = computed(() =>
    this.available() ? (this.priceRow()?.label ?? '') : '',
  );

  /**
   * What this selection will cost — priced on the quantity that would actually
   * be added, not on the one half-typed in the field. A number someone is still
   * typing is not a product without a price, and saying so while they type
   * reads as one.
   */
  protected readonly total = computed(() => {
    if (!this.available()) return null;
    const exact = exactLineTotal(
      this.item().prices,
      this.packaging(),
      this.unit(),
      this.effectiveQuantity(),
    );
    return exact === null ? null : formatPriceMinor(exact, this.currency);
  });

  /** What the line costs — or, where it cannot be priced, that it cannot be:
   * "Added for On request" is a sentence that says less than the two words in
   * it. */
  protected readonly addedMessage = computed(() => {
    const total = this.total();
    return total === null
      ? this.text.noPrice
      : fillText(this.text.addedFor, { total });
  });

  protected readonly priceClass = computed(() =>
    this.compact()
      ? 'text-lg font-bold text-primary'
      : 'text-2xl font-bold text-primary',
  );
  protected readonly priceUnitClass = computed(() =>
    this.compact()
      ? 'text-xs font-normal text-subtle'
      : 'text-base font-normal text-subtle',
  );

  /** In a row the spacing belongs to the cells, which have to space
   * themselves differently in each arrangement. */
  protected readonly group = computed(
    () => `${SEGMENTED_GROUP} flex w-full ${this.row() ? '' : 'mt-2'}`,
  );

  /**
   * The row's grid: one column of blocks in card order until there is room for
   * two, then two columns — which happens well before the line itself turns
   * (ProductRow's own threshold), so a line too narrow to put the name beside
   * the controls still puts the controls side by side under it.
   *
   * Measured on the column these controls were given rather than on the line,
   * because they are not the same width: the cart's tick box comes off the
   * line first. The threshold is exactly what two columns cost — 13rem each
   * and the gap between them — so they pair the moment they fit.
   *
   * Stacked, the single column fills what it was given. Capping it made a line
   * narrower than a card at the width where the two are supposed to be drawing
   * the same thing.
   */
  protected readonly rowGrid =
    'grid grid-cols-1 @min-[27.5rem]/body:grid-cols-[13rem_13rem] @min-[27.5rem]/body:gap-x-6';

  /**
   * Where each block sits, and what it stands off from what is above it.
   *
   * Written out per cell rather than composed, because Tailwind reads these
   * strings out of the source: a class assembled at runtime is a class that
   * was never generated.
   */
  protected readonly cell = {
    // Half a step down in the two-column arrangement: the price is text where
    // the segments beside it are a pill, and starting at the same edge is not
    // the same as sitting on the same axis.
    price:
      '@min-[27.5rem]/body:col-start-2 @min-[27.5rem]/body:row-start-1 @min-[27.5rem]/body:mt-0.5',
    units:
      'mt-2 @min-[27.5rem]/body:col-start-1 @min-[27.5rem]/body:row-start-1 @min-[27.5rem]/body:mt-0',
    // The stepper follows its pill as closely as it does on a card, and the
    // action follows the price by exactly as much — they share a grid row, so
    // what one stands off by is what keeps the two columns on one axis.
    stepper:
      'mt-1 @min-[27.5rem]/body:col-start-1 @min-[27.5rem]/body:row-start-2 @min-[27.5rem]/body:mt-1',
    // The facts stand off the block above them by as much as a card's do,
    // either way round: they are a caption, and a caption crowding what it
    // captions reads as part of it.
    minimum:
      'mt-2 @min-[27.5rem]/body:col-start-1 @min-[27.5rem]/body:row-start-3',
    // Under the minimum while the blocks are stacked (the two facts read as
    // one small block there), under the price and the button once they are
    // not — a packaging line qualifies the price it sits with.
    packaging:
      '@min-[27.5rem]/body:col-start-2 @min-[27.5rem]/body:row-start-3 @min-[27.5rem]/body:mt-2',
    // The same offset as the stepper it sits beside, so the two start on one
    // axis; only the price needs the half-step, being text against a pill.
    action:
      'mt-2 @min-[27.5rem]/body:col-start-2 @min-[27.5rem]/body:row-start-2 @min-[27.5rem]/body:mt-1',
  } as const;

  protected readonly segment = (unit: ProductUnit): string =>
    segmentClass(this.segmentState(unit), true);

  /**
   * The row's height is set here rather than left to the field, so the ends can
   * be exactly as wide as they are tall. It does not clip: the keys round their
   * own outer corners instead, and a bubble hanging out of the row has to be
   * able to leave it.
   */
  protected readonly stepperGroup = computed(
    () =>
      `${this.row() ? '' : 'mt-1'} flex w-full items-stretch rounded-md border border-border-strong ${
        this.compact() ? 'h-9' : 'h-10'
      }`,
  );
  /**
   * Square ends, so the stepper reads as a field with two keys rather than as a
   * row of three things of different widths.
   *
   * The focus ring is drawn inside the key. The app's ring sits on the edge,
   * and on a key welded into a bordered row that came out as a stray line
   * between the key and the field beside it.
   */
  protected readonly stepperButton = computed(
    () =>
      `flex shrink-0 cursor-pointer items-center justify-center text-ink transition-colors hover:bg-stone-100 hover:text-accent active:text-primary focus-visible:-outline-offset-2 ${
        this.compact() ? 'w-9' : 'w-10'
      }`,
  );
  /** Everything the ends leave over. No ring of its own: it is welded into a
   * row that is already outlined. */
  protected readonly quantityField = computed(
    () =>
      `h-full w-full min-w-0 rounded-none border-x border-y-0 border-border-strong px-1 py-0 text-center focus-visible:outline-none ${
        this.compact() ? 'text-sm' : ''
      }`,
  );
  /** The button's own metrics, so the row does not move when one replaces the
   * other. In a row the cell above it already carries the spacing. */
  protected readonly addedField = computed(
    () =>
      `${this.row() ? '' : 'mt-2'} w-full rounded-md bg-secondary p-2 text-center text-sm font-medium text-white`,
  );
  protected readonly addButton = computed(
    () => `${this.row() ? '' : 'mt-2'} w-full`,
  );

  protected chooseUnit(unit: ProductUnit): void {
    const quantity = this.converted(this.unit(), unit, this.quantity());
    if (this.inCart()) {
      this.writeLine(unit, quantity);
    } else {
      this.chosenUnit.set(unit);
      this.chosenQuantity.set(quantity);
    }
    this.edited();
  }

  protected openNote(): void {
    this.popup.set({ at: 'note', message: '' });
  }

  protected onNoteInput(event: Event): void {
    this.ownNote.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Written to the cart when the field is left, not on every keystroke: a note
   * is a sentence, and a line rewritten letter by letter is a line the browser
   * stores dozens of times to record one. A product not yet in the cart keeps
   * it here until it is added.
   */
  protected saveNote(): void {
    if (this.inCart())
      this.cart.setNote(this.item().slug, this.effectiveNote());
  }

  /** A segment the product has no price for answers for itself rather than
   * being missing from the row. */
  protected explainUnit(unit: ProductUnit): void {
    this.popup.set({ at: unit, message: this.text.unitNotSold });
  }

  protected onQuantityInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.setQuantity(Math.max(1, Number.parseInt(raw, 10) || 1));
    this.edited();
  }

  /**
   * Corrects on the way out, and writes the number back into the field. An
   * emptied field, or a nought, is a quantity nobody can be sold: the signal
   * has long since clamped it to one, but a clamp the field does not show is a
   * page disagreeing with itself.
   */
  protected onQuantityBlur(event: Event): void {
    this.correct();
    (event.target as HTMLInputElement).value = String(this.quantity());
  }

  /**
   * One step is one minimum lot for pieces, so `+` on a product sold in
   * hundreds moves by a hundred rather than into an invalid quantity.
   *
   * There is nothing below the minimum except not buying the product at all, so
   * that is what `−` offers there — once it is in the cart and there is
   * something to take out.
   */
  protected step(direction: 1 | -1): void {
    const step = this.stepSize();
    const wanted = this.quantity() + direction * step;
    if (wanted < step) {
      this.edited();
      if (this.inCart()) {
        this.popup.set({ at: 'remove', message: this.text.removeQuestion });
      }
      return;
    }
    this.setQuantity(wanted);
    this.edited();
  }

  /**
   * Rounds a typed piece quantity up to the nearest one that can be supplied.
   * The field is left alone until then, so a half-typed number is not rewritten
   * under the cursor.
   */
  protected correct(): void {
    if (this.unit() !== 'piece') return;
    const wanted = this.quantity();
    const corrected = correctPieceQuantity(this.packaging(), wanted);
    if (corrected === wanted) return;
    this.setQuantity(corrected);
    this.popup.set({
      at: 'quantity',
      message: fillText(this.text.quantityCorrected, {
        from: wanted,
        to: corrected,
        unit: this.unitText.piece,
      }),
    });
  }

  protected add(): void {
    this.correct();
    this.feedback.set(
      this.cart.add({
        ...this.addition(),
        unit: this.unit(),
        quantity: this.quantity(),
      }),
    );
  }

  protected confirmRemove(): void {
    this.cart.remove(this.item().slug, this.unit());
    this.dismiss();
  }

  /** Any click outside a bubble closes it, and for the question that counts as
   * "no" — the line stays as it was. */
  protected dismiss(): void {
    this.popup.set(null);
  }

  private segmentState(unit: ProductUnit): SegmentState {
    if (!this.options().find((option) => option.unit === unit)?.available) {
      return 'unavailable';
    }
    return unit === this.unit() ? 'selected' : 'available';
  }

  /** The step, and equally the smallest quantity worth keeping: below it the
   * only sensible quantity is none. */
  private stepSize(): number {
    return this.unit() === 'piece'
      ? Math.max(1, this.packaging().minPieceQty)
      : 1;
  }

  /** The quantity a piece line would really be bought in. */
  private effectiveQuantity(): number {
    return this.unit() === 'piece'
      ? correctPieceQuantity(this.packaging(), this.quantity())
      : this.quantity();
  }

  /** The same quantity of the same product, expressed in another unit —
   * rounded up where the pieces do not fill a whole one. */
  private converted(from: ProductUnit, to: ProductUnit, quantity: number) {
    if (from === to) return quantity;
    return (
      convertUnitQuantity(this.packaging(), from, to, quantity)?.quantity ??
      this.startQuantity(to)
    );
  }

  private startQuantity(unit: ProductUnit): number {
    return unit === 'piece' ? this.packaging().minPieceQty : 1;
  }

  private setQuantity(quantity: number): void {
    if (this.inCart()) this.writeLine(this.unit(), quantity);
    else this.chosenQuantity.set(quantity);
  }

  private writeLine(unit: ProductUnit, quantity: number): void {
    this.cart.setLine({ ...this.addition(), unit, quantity });
  }

  /** What will be recorded with the line: the caller's note where it manages
   * one, otherwise the controls' own. */
  private effectiveNote(): string | null {
    if (this.externalNote()) return this.note();
    const own = this.ownNote().trim();
    return own === '' ? null : own;
  }

  private addition() {
    const item = this.item();
    return {
      slug: item.slug,
      name: item.name,
      unit: this.unit(),
      quantity: this.quantity(),
      note: this.effectiveNote(),
      // Never undefined: callers hand over the product's first photo, and a
      // product with none has no first element. What is written down has to
      // survive `JSON.stringify`, which drops an undefined field — and a
      // stored line missing one is discarded when it is read back.
      image: this.image() ?? null,
      prices: item.prices,
      packaging: item.packaging,
      lineNoteEnabled: item.lineNoteEnabled,
      lineNotePrompt: item.lineNotePrompt,
    };
  }

  /** Any change to the selection drops whatever the last action said about it. */
  private edited(): void {
    this.feedback.set(null);
    this.dismiss();
  }
}
