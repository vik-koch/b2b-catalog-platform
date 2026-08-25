import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import {
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
import { Button } from '../ui/button';
import { Icon } from '../ui/icons/icon';
import { Input } from '../ui/input';
import { NumericField } from '../ui/numeric-field';
import { Popover } from '../ui/popover';
import { SEGMENTED_GROUP, SegmentState, segmentClass } from '../ui/segmented';
import { formatPriceMinor } from './price';
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
  /** `quantity`, `remove`, or the unit whose segment was pressed. */
  at: 'quantity' | 'remove' | ProductUnit;
  message: string;
}

/** The little a grid tile and a product page have to agree on to sell
 * something: what it is called, what it costs and how it is packed. */
export interface BuyableProduct {
  slug: string;
  name: string;
  prices: UnitPrices;
  packaging: ProductPackagingInfo;
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
 * the same three places, so a grid of these lines up column by column.
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
  imports: [Button, Icon, Input, NumericField, Popover],
  host: { class: 'block' },
  template: `
    <p [class]="priceClass()">
      {{ price() }}
      <span [class]="priceUnitClass()">{{ priceUnit() }}</span>
    </p>

    <!-- All three units, always, in the same three places: the segments divide
         the row in proportion to their labels, and a unit the product is not
         sold in is shown greyed and says so when pressed. -->
    <div role="radiogroup" [attr.aria-label]="text.unitLabel" [class]="group">
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

    <!-- One control, not three: the steppers are welded to the field's ends, so
         it reads as a single number input rather than as a row of buttons that
         happen to sit nearby. Square ends, and the field takes the rest. -->
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

    <ng-content />

    @if (canAdd()) {
      @if (inCart()) {
        <!-- A field, not a button: it is the same size and in the same place as
             the one it replaced, so the row does not move, but there is nothing
             left to press — the stepper above is what changes the line now. -->
        <p [class]="addedField" role="status">{{ addedMessage() }}</p>
      } @else {
        <button type="button" appButton class="mt-2 w-full" (click)="add()">
          <app-icon name="shopping-basket" class="mr-2 h-4 w-4" />
          {{ text.add }}
        </button>
      }

      @if (feedback() === 'full') {
        <p class="mt-2 text-sm text-amber-700" role="status">{{ text.full }}</p>
      }
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
  /** False in the product editor's live preview: the block is there to show
   * what a visitor will see, not to fill a manager's own cart. */
  readonly canAdd = input(true);
  /** Card-sized rather than page-sized: smaller type and a denser stepper. */
  readonly compact = input(false);

  protected readonly radioName = `unit-${nextGroupId++}`;

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

  protected readonly popup = signal<Popup | null>(null);
  /** What the last add did, if anything — cleared by any further edit, so it
   * never describes a selection that has since changed. */
  protected readonly feedback = signal<CartAddResult | null>(null);

  private readonly priceRow = computed(() =>
    this.units.priceRow(this.item().prices, this.unit()),
  );
  protected readonly price = computed(
    () => this.priceRow()?.price ?? this.text.noPrice,
  );
  protected readonly priceUnit = computed(() => this.priceRow()?.label ?? '');

  /**
   * What this selection will cost — priced on the quantity that would actually
   * be added, not on the one half-typed in the field. A number someone is still
   * typing is not a product without a price, and saying so while they type
   * reads as one.
   */
  protected readonly total = computed(() => {
    const exact = exactLineTotal(
      this.item().prices,
      this.packaging(),
      this.unit(),
      this.effectiveQuantity(),
    );
    return exact === null
      ? this.text.noPrice
      : formatPriceMinor(exact, this.currency);
  });

  protected readonly addedMessage = computed(() =>
    fillText(this.text.addedFor, { total: this.total() }),
  );

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

  protected readonly group = `${SEGMENTED_GROUP} mt-2 flex w-full`;

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
      `mt-1 flex w-full items-stretch rounded-md border border-border-strong ${
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
   * other. */
  protected readonly addedField =
    'mt-2 w-full rounded-md bg-secondary p-2 text-center text-sm font-medium text-white';

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

  private addition() {
    const item = this.item();
    return {
      slug: item.slug,
      name: item.name,
      unit: this.unit(),
      quantity: this.quantity(),
      note: this.note(),
      prices: item.prices,
      packaging: item.packaging,
    };
  }

  /** Any change to the selection drops whatever the last action said about it. */
  private edited(): void {
    this.feedback.set(null);
    this.dismiss();
  }
}
