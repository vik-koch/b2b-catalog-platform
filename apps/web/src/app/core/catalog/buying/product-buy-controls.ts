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
  CatalogImage,
  correctPieces,
  exactLineTotal,
  ProductAvailability,
  ProductImage,
  ProductPackaging,
  ProductUnit,
  ProductVariant,
  UnitPrices,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared';
import { CartAddResult, CartService } from '../../../shared/cart/cart.service';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { ButtonBox } from '@b2b-catalog-platform/ui/actions/button-box';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Popover } from '@b2b-catalog-platform/ui/overlay/popover';
import {
  Segment,
  type SegmentState,
} from '@b2b-catalog-platform/ui/choices/segment';
import { SegmentGroup } from '@b2b-catalog-platform/ui/choices/segment-group';
import { createBuyQuantity } from './buy-quantity';
import { ProductNoteEditor } from './product-note-editor';
import { ProductPairings } from './product-pairings';
import { ProductUnitFacts } from './product-unit-facts';
import { useProductUnits } from './product-units-view';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';
import { FirstRender } from '../../../shared/core/first-render';
import { minusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/minus';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';
import { numericRules } from '@b2b-catalog-platform/ui/inputs/numeric-rules';
import { Allow } from '@b2b-catalog-platform/ui/inputs/allow';

/** How long a statement stays on screen before it fades away. */
const NOTICE_MS = 5000;

/** Radios group by name across the document, and a grid holds dozens. */
let nextGroupId = 0;

/** One bubble at a time, under the control it is about. */
interface Popup {
  /** Or the unit whose segment was pressed. */
  at: 'quantity' | 'remove' | 'note' | ProductUnit;
  message: string;
}

/** What a tile and a product page must agree on to sell something. */
export interface BuyableProduct {
  slug: string;
  name: string;
  prices: UnitPrices;
  packaging: ProductPackaging;
  /** FR-STOCK-02; null is untracked. Read here, not per caller: out of stock
   * takes the controls out of use (FR-STOCK-04) wherever they are. */
  availability?: ProductAvailability | null;
  /** FR-CART-08. */
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
  /** FR-SET-05; zero is no marker. Optional, as this and the three below are
   * missing from a cart line stored before they existed. */
  pairedCount?: number;
  /** FR-CAT-10. */
  parts?: readonly string[];
  /** Recorded with the line, so its mark shows from the first frame
   * (FR-CAT-11/13). */
  variants?: readonly ProductVariant[];
  images?: readonly ProductImage[];
}

/**
 * Unit, quantity and the way into the cart (FR-UNIT-07, FR-CART-01), the same
 * on a tile, a row and the product page, in the order the decision is taken.
 * The three units always stand in the same three places, so a grid lines up.
 *
 * - One price, the chosen unit's.
 * - A product is one line: once in the cart these controls edit it, and the
 *   button gives way to what the line costs.
 * - A quantity is corrected upwards, never refused, in a bubble that goes by
 *   itself. Changing unit never needs it: a unit is a lens on pieces.
 * - Down past the minimum asks to take it out; a click elsewhere is "no".
 */
@Component({
  selector: 'app-product-buy-controls',
  imports: [
    WarningNote,
    Button,
    ButtonBox,
    Icon,
    Input,
    NgTemplateOutlet,
    Allow,
    Popover,
    ProductNoteEditor,
    ProductPairings,
    ProductUnitFacts,
    Segment,
    SegmentGroup,
  ],
  host: { class: 'block' },
  template: `
    <!-- Two arrangements are two orders of these five blocks. -->
    <ng-template #priceBlock>
      <!-- The note shares the price's line: a card has no row to spare. -->
      <div class="flex items-center justify-between gap-2">
        <p [class]="priceClass()">
          {{ price() }}
          <span [class]="priceUnitClass()">{{ priceUnit() }}</span>
        </p>

        <div class="flex items-center gap-1">
          <!-- What the caller does to the line: the cart's bin. -->
          <ng-content select="[priceAction]" />

          <!-- Left of the note, which keeps its corner. -->
          @if (marker(); as paired) {
            <app-product-pairings [slug]="item().slug" [count]="paired" />
          }

          @if (asksForNote()) {
            <app-product-note-editor
              [value]="ownNote()"
              [prompt]="notePrompt()"
              [open]="popup()?.at === 'note'"
              (requestOpen)="openNote()"
              (valueChange)="ownNote.set($event)"
              (save)="saveNote()"
              (done)="closeNote()"
              (cancelled)="cancelNote()"
              (dismissed)="dismiss()"
            />
          }
        </div>
      </div>
      @if (priceNote(); as note) {
        <p class="text-xs text-ink-subtle">{{ note }}</p>
      }
    </ng-template>

    <!-- A unit not sold is greyed and says so when pressed. -->
    <ng-template #unitsBlock>
      <div
        uiSegmentGroup
        role="radiogroup"
        [attr.aria-label]="text.unitAria"
        [class]="group()"
      >
        @for (option of options(); track option.unit) {
          <!-- Flex, so the segment fills its share of the row. -->
          <div class="relative flex flex-auto">
            @if (option.available && sellable()) {
              <label
                uiSegment
                [state]="segmentState(option.unit)"
                [grow]="true"
                [locked]="!sellable()"
              >
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
              <!-- A button, not a disabled radio: pressing it says why. Only
                   a line that cannot be bought at all disables every segment;
                   the badge or the row says it once. -->
              <button
                type="button"
                uiSegment
                [state]="segmentState(option.unit)"
                [grow]="true"
                [locked]="!sellable()"
                class="w-full"
                [disabled]="!sellable()"
                (click)="explainUnit(option.unit)"
              >
                {{ option.label }}
              </button>
            }

            @if (popup(); as open) {
              @if (open.at === option.unit) {
                <!-- Hung inwards, or an end segment's bubble leaves the card
                     on a phone. -->
                <ui-popover
                  [align]="$last ? 'end' : $first ? 'start' : 'center'"
                  [duration]="noticeMs"
                  (dismissed)="dismiss()"
                >
                  <p role="status">{{ open.message }}</p>
                </ui-popover>
              }
            }
          </div>
        }
      </div>
    </ng-template>

    <!-- One control: the steppers are welded to the field's ends. -->
    <ng-template #stepperBlock>
      <div [class]="stepperGroup()">
        <div class="relative flex">
          <button
            type="button"
            [class]="stepperButton() + ' rounded-l-md border-r-0'"
            [attr.aria-label]="text.decreaseAria"
            [disabled]="!sellable()"
            (click)="step(-1)"
          >
            <ui-icon [glyph]="minusIcon" class="size-4" />
          </button>

          @if (popup(); as open) {
            @if (open.at === 'remove') {
              <ui-popover align="start" (dismissed)="dismiss()">
                <p>{{ open.message }}</p>
                <!-- Keep first, remove second, as every confirmation. -->
                <div class="mt-2 flex gap-2">
                  <button
                    type="button"
                    uiButton
                    variant="secondary"
                    size="sm"
                    class="flex-1"
                    (click)="dismiss()"
                  >
                    {{ text.removeNo }}
                  </button>
                  <button
                    type="button"
                    uiButton
                    variant="danger"
                    size="sm"
                    class="flex-1"
                    (click)="confirmRemove()"
                  >
                    {{ text.removeYes }}
                  </button>
                </div>
              </ui-popover>
            }
          }
        </div>

        <div class="relative flex flex-1">
          <!-- Decimal only where a reading can be one: a unit holding several
               pieces. The value is the draft while typing (see fieldText). -->
          <input
            uiInput
            [uiAllow]="numericRules[whole() ? 'integer' : 'decimal']"
            [attr.inputmode]="whole() ? 'numeric' : 'decimal'"
            [class]="quantityField()"
            [attr.aria-label]="text.quantityAria"
            [disabled]="!sellable()"
            [value]="fieldText()"
            (input)="onQuantityInput($event)"
            (keydown)="onQuantityKey($event)"
            (blur)="onQuantityBlur($event)"
          />

          @if (popup(); as open) {
            @if (open.at === 'quantity') {
              <ui-popover [duration]="noticeMs" (dismissed)="dismiss()">
                <p role="status">{{ open.message }}</p>
              </ui-popover>
            }
          }
        </div>

        <button
          type="button"
          [class]="stepperButton() + ' rounded-r-md border-l-0'"
          [attr.aria-label]="text.increaseAria"
          [disabled]="!sellable()"
          (click)="step(1)"
        >
          <ui-icon [glyph]="plusIcon" class="size-4" />
        </button>
      </div>
    </ng-template>

    <ng-template #actionBlock>
      @if (canAdd()) {
        @if (inCart()) {
          <!-- A field in the button's place and size: nothing left to press. -->
          <p uiButtonBox [class]="addedField()" role="status">
            {{ addedMessage() }}
          </p>
        } @else {
          <!-- Off, not gone (FR-STOCK-04), or the card is a row short. -->
          <button
            type="button"
            uiButton
            [class]="addButton()"
            [disabled]="!sellable()"
            (click)="add()"
          >
            <ui-icon [glyph]="shoppingBasketIcon" class="mr-2 size-4" />
            {{ text.add }}
          </button>
        }

        @if (feedback() === 'full') {
          <ui-warning-note class="mt-2" role="status">
            {{ text.full }}
          </ui-warning-note>
        }
      }
    </ng-template>

    <!-- Projected once, placed by either arrangement. -->
    <ng-template #extras><ng-content /></ng-template>

    @if (row()) {
      <!-- By the row's own width (a container query: a listing beside a
           filter panel is narrow at any window). Wide, the blocks fall into
           two columns without moving in the DOM, so the tab order holds. -->
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
          <!-- In the selected unit, as the stepper beside it counts. -->
          <app-product-unit-facts
            show="minimum"
            [unit]="unit()"
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
  protected readonly numericRules = numericRules;
  protected readonly minusIcon = minusIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly shoppingBasketIcon = shoppingBasketIcon;
  private readonly cart = inject(CartService);
  private readonly firstRender = inject(FirstRender);
  private readonly units = useProductUnits();
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));

  protected readonly text = inject(STOREFRONT_TEXT).cart;
  protected readonly noticeMs = NOTICE_MS;

  readonly item = input.required<BuyableProduct>();
  /** Where the caller offers its own note field. */
  readonly note = input<string | null>(null);
  /** Recorded with the line: the cart draws from the browser's copy before
   * the pricing call answers. */
  readonly image = input<CatalogImage | null>(null);
  /** The caller shows its own note field (product page, cart), so these
   * controls record `note` and offer no button. */
  readonly externalNote = input(false);
  /** False in the editor's preview. */
  readonly canAdd = input(true);
  /** Card-sized: smaller type, a denser stepper. */
  readonly compact = input(false);
  /** Under the price, on the product page. */
  readonly priceNote = input<string | null>(null);
  /** False where the caller shows the counterparts itself, and inside the
   * panel they open. */
  readonly offerPairings = input(true);
  /** False for a cart line the shop can no longer price (withdrawn, or
   * repackaged): no figure, no input; the row says why. */
  readonly available = input(true);

  /** An empty shelf stays priced, only the controls are out of use
   * (FR-STOCK-04); "few left" restricts nothing. */
  protected readonly inStock = computed(
    () => this.item().availability !== 'out',
  );
  protected readonly sellable = computed(
    () => this.available() && this.inStock(),
  );

  /** `row` turns the blocks into a product line's two columns. */
  readonly layout = input<'stack' | 'row'>('stack');
  protected readonly row = computed(() => this.layout() === 'row');

  protected readonly radioName = `unit-${nextGroupId++}`;

  protected readonly packaging = computed(() => this.item().packaging);
  protected readonly options = computed(() =>
    this.units.unitOptions(this.packaging()),
  );

  /** Not before the first render: the server drew an empty cart, and
   * hydration must find it (see FirstRender). */
  protected readonly line = computed(() =>
    this.firstRender.over() ? this.cart.lineFor(this.item().slug) : undefined,
  );
  protected readonly inCart = computed(() => this.line() !== undefined);

  /** The draft and the stepper's arithmetic (see `buy-quantity.ts`), writing
   * through the cart's line where there is one. */
  private readonly chosen = createBuyQuantity({
    packaging: this.packaging,
    product: computed(() => this.item().slug),
    line: this.line,
    write: (unit, pieces) => this.writeLine(unit, pieces),
    currency: this.currency,
  });

  protected readonly unit = this.chosen.unit;
  protected readonly pieces = this.chosen.pieces;
  protected readonly whole = this.chosen.whole;
  protected readonly fieldText = this.chosen.fieldText;

  /** Seeded from the cart's line, reset with the product. */
  readonly ownNote = linkedSignal<string, string>({
    source: () => this.item().slug,
    computation: () => this.line()?.note ?? '',
  });

  /** The product takes a note and no caller offers a field. */
  protected readonly asksForNote = computed(
    () => this.item().lineNoteEnabled && !this.externalNote(),
  );
  /** Null is no marker. */
  protected readonly marker = computed(() => {
    const count = this.item().pairedCount ?? 0;
    return this.offerPairings() && count > 0 ? count : null;
  });
  protected readonly notePrompt = computed(
    () => this.item().lineNotePrompt ?? this.text.notePrompt,
  );

  /** The caller's own correction (the cart's, from the server), in the
   * stepper's bubble. */
  readonly notice = input<string | null>(null);

  /** A correction just made, a unit not sold, the question under `−`. */
  private readonly ownPopup = signal<Popup | null>(null);

  /** What cancelling puts back. */
  private noteAtOpen = '';

  /**
   * Held once arrived: the cart writes the corrected line back and asks again,
   * and the next answer carries no notice, which closed a bound bubble early.
   * The source only opens it; the customer or the timer closes it.
   */
  private readonly heldNotice = linkedSignal<string | null, string | null>({
    source: () => this.notice(),
    computation: (notice, previous) => notice ?? previous?.value ?? null,
  });

  /** The controls' own first: it is about what was just done. */
  protected readonly popup = computed<Popup | null>(() => {
    const own = this.ownPopup();
    if (own !== null) return own;
    const held = this.heldNotice();
    return held === null ? null : { at: 'quantity', message: held };
  });
  /** Cleared by any edit, so it never describes a changed selection. */
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

  /** On the quantity that would be added, not the half-typed draft. */
  protected readonly total = computed(() => {
    if (!this.available()) return null;
    const exact = exactLineTotal(
      this.item().prices.piece,
      correctPieces(this.packaging(), this.pieces()),
    );
    return exact === null ? null : formatMoneyMinor(exact, this.currency);
  });

  /** Unpriced says so alone: "Added for On request" says less. */
  protected readonly addedMessage = computed(() => {
    const total = this.total();
    return total === null
      ? this.text.noPrice
      : fillText(this.text.addedFor, { total });
  });

  protected readonly priceClass = computed(() =>
    this.compact()
      ? 'text-lg font-emphasis text-primary'
      : 'text-2xl font-emphasis text-primary',
  );
  protected readonly priceUnitClass = computed(() =>
    this.compact()
      ? 'text-xs font-normal text-ink-subtle'
      : 'text-base font-normal text-ink-subtle',
  );

  /** In a row the cells do the spacing. */
  protected readonly group = computed(
    () => `flex w-full ${this.row() ? '' : 'mt-2'}`,
  );

  /**
   * Two columns from exactly what they cost (2 × 13.5rem + the gap), measured
   * on the controls' own column: the cart's tick box comes off the line. Earlier
   * than the line itself turns (ProductRow), so the controls pair under a name.
   */
  protected readonly rowGrid = `grid grid-cols-1
                                @min-[28.5rem]/body:grid-cols-[13.5rem_13.5rem]
                                @min-[28.5rem]/body:gap-x-6`;

  /** Written out per cell: Tailwind reads these strings from the source, and
   * a class assembled at runtime is never generated. */
  protected readonly cell = {
    // Half a step down: text beside a pill sits on its axis, not its edge.
    price: `@min-[28.5rem]/body:col-start-2 @min-[28.5rem]/body:row-start-1
            @min-[28.5rem]/body:mt-0.5`,
    units: `mt-2
            @min-[28.5rem]/body:col-start-1 @min-[28.5rem]/body:row-start-1
            @min-[28.5rem]/body:mt-0`,
    // Stepper and action share a row, so equal offsets keep one axis.
    stepper: `mt-1
              @min-[28.5rem]/body:col-start-1 @min-[28.5rem]/body:row-start-2
              @min-[28.5rem]/body:mt-1`,
    minimum:
      'mt-2 @min-[28.5rem]/body:col-start-1 @min-[28.5rem]/body:row-start-3',
    // Under the price once in columns: it qualifies the price.
    packaging: `@min-[28.5rem]/body:col-start-2
                @min-[28.5rem]/body:row-start-3 @min-[28.5rem]/body:mt-2`,
    action: `mt-2
             @min-[28.5rem]/body:col-start-2 @min-[28.5rem]/body:row-start-2
             @min-[28.5rem]/body:mt-1`,
  } as const;

  /**
   * The height is set here, so the keys are square. No clip, so a bubble can
   * leave the row; the keys round their own corners. No border: each part
   * carries its own edge, as the navbar's search field does, or lighting the
   * field drew a box inside a box.
   */
  protected readonly stepperGroup = computed(
    () =>
      `${this.row() ? '' : 'mt-1'} flex w-full items-stretch
       ${this.compact() ? 'h-9' : 'h-10'}`,
  );
  /** The focus ring inside the key: on the edge it was a stray line between
   * key and field. */
  protected readonly stepperButton = computed(
    () =>
      `flex shrink-0 cursor-pointer items-center justify-center border
       border-edge-strong text-ink transition-colors select-none
       ${this.compact() ? 'w-9' : 'w-10'}
       hover:bg-surface-subtle-hover hover:text-accent
       active:bg-surface-subtle-press active:text-primary
       focus-visible:-outline-offset-2
       disabled:cursor-not-allowed disabled:text-ink-disabled`,
  );
  /** It owns both seams, the keys dropping their border where they meet it,
   * so its edge alone lights up with the Input directive's own hover and
   * focus. */
  protected readonly quantityField = computed(
    () =>
      `h-full w-full min-w-0 rounded-none px-1 py-0 text-center
       ${this.compact() ? 'text-sm' : ''}`,
  );
  /** The button's metrics (ButtonBox), so replacing it moves nothing. */
  protected readonly addedField = computed(
    () =>
      `${this.row() ? '' : 'mt-2'} w-full animate-field-in bg-secondary
       text-center text-white`,
  );
  protected readonly addButton = computed(
    () => `${this.row() ? '' : 'mt-2'} w-full`,
  );

  protected chooseUnit(unit: ProductUnit): void {
    if (this.chosen.chooseUnit(unit)) this.edited();
  }

  protected openNote(): void {
    this.noteAtOpen = this.ownNote();
    this.ownPopup.set({ at: 'note', message: '' });
  }

  /** A modal has no "away" to click, so its button saves and closes. */
  protected closeNote(): void {
    this.saveNote();
    this.dismiss();
  }

  /** Saves too: pressing it blurred the field, which already sent the
   * discarded text, so the old one is written over it. */
  protected cancelNote(): void {
    this.ownNote.set(this.noteAtOpen);
    this.saveNote();
    this.dismiss();
  }

  /** On leaving the field, not per keystroke. Not yet in the cart, it waits
   * here for the add. */
  protected saveNote(): void {
    if (this.inCart())
      this.cart.setNote(this.item().slug, this.effectiveNote());
  }

  protected explainUnit(unit: ProductUnit): void {
    this.ownPopup.set({ at: unit, message: this.text.unitNotSold });
  }

  protected onQuantityInput(event: Event): void {
    this.chosen.type((event.target as HTMLInputElement).value);
    this.edited();
  }

  /** Up and down step as in a number field, through `step`, so down at the
   * minimum asks what `−` asks. */
  protected onQuantityKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    // Or the caret runs to an end, or the page scrolls.
    event.preventDefault();
    this.step(event.key === 'ArrowUp' ? 1 : -1);
    // As on blur: the binding does not write back an unchanged figure.
    (event.target as HTMLInputElement).value = this.chosen.quantityText();
  }

  /** Writes the figure back: the binding would not where the quantity did not
   * move, and an emptied field would disagree with it. */
  protected onQuantityBlur(event: Event): void {
    this.commit();
    (event.target as HTMLInputElement).value = this.chosen.quantityText();
  }

  /** Below the minimum is not buying it, which `−` offers once in the cart. */
  protected step(direction: 1 | -1): void {
    const outcome = this.chosen.step(direction);
    this.edited();
    if (outcome === 'at-floor' && this.inCart()) {
      this.ownPopup.set({ at: 'remove', message: this.text.removeQuestion });
    }
  }

  /** Every way out of the field goes through here, so a draft is committed
   * once. The correction names no figures: the field shows the one that
   * stands. */
  protected commit(): void {
    if (!this.chosen.commit()) return;
    this.ownPopup.set({
      at: 'quantity',
      message: this.text.issues.quantityCorrected,
    });
  }

  protected add(): void {
    this.commit();
    this.feedback.set(this.cart.add(this.addition(this.unit(), this.pieces())));
  }

  protected confirmRemove(): void {
    this.cart.remove(this.item().slug);
    this.dismiss();
  }

  /** A click outside closes the bubble; for the question that is "no". */
  protected dismiss(): void {
    this.ownPopup.set(null);
    this.heldNotice.set(null);
  }

  protected segmentState(unit: ProductUnit): SegmentState {
    // Not a choice any more, but still the unit "12" is read in.
    if (!this.sellable()) {
      return unit === this.unit() ? 'selected' : 'unavailable';
    }
    if (!this.options().find((option) => option.unit === unit)?.available) {
      return 'unavailable';
    }
    return unit === this.unit() ? 'selected' : 'available';
  }

  private writeLine(unit: ProductUnit, pieces: number): void {
    this.cart.setLine(this.addition(unit, pieces));
  }

  /** The caller's note where it manages one, else the controls' own. */
  private effectiveNote(): string | null {
    if (this.externalNote()) return this.note();
    const own = this.ownNote().trim();
    return own === '' ? null : own;
  }

  /** No field may be undefined: `JSON.stringify` drops it, and a stored line
   * missing one is discarded when read back. */
  private addition(unit: ProductUnit, pieces: number) {
    const item = this.item();
    return {
      slug: item.slug,
      name: item.name,
      unit,
      pieces,
      note: this.effectiveNote(),
      image: this.storedImage(),
      prices: item.prices,
      packaging: item.packaging,
      // The baseline the next visit's pricing is compared against (FR-CART-10).
      availability: item.availability ?? null,
      lineNoteEnabled: item.lineNoteEnabled,
      lineNotePrompt: item.lineNotePrompt,
      pairedCount: item.pairedCount ?? 0,
      parts: [...(item.parts ?? [])],
      variants: [...(item.variants ?? [])],
      images: [...(item.images ?? [])],
    };
  }

  /** The pair alone: the line's own pictures carry the variant. */
  private storedImage(): CatalogImage | null {
    const image = this.image();
    return image ? { full: image.full, thumb: image.thumb } : null;
  }

  /** Any change drops what the last action said. */

  private edited(): void {
    this.feedback.set(null);
    this.dismiss();
  }
}
