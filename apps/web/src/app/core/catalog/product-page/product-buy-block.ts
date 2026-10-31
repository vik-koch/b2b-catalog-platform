import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { CART_NOTE_MAX } from '@b2b-catalog-platform/shared';
import { ProductDetail } from '@b2b-catalog-platform/shared/core/catalog';
import { CartService } from '../../../shared/cart/cart.service';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { AutoGrow } from '@b2b-catalog-platform/ui/inputs/auto-grow';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { ProductAvailabilityBadge } from '../ui/product-availability-badge';
import { ProductBuyControls } from '../buying/product-buy-controls';
import { ProductPairings } from '../buying/product-pairings';
import { ProductSetBadge } from '../ui/product-set-badge';
import { ProductUnitFacts } from '../ui/product-unit-facts';
import { useTaxStatement } from '../pricing/tax-statement';
import { Card } from '@b2b-catalog-platform/ui/content/card';

/**
 * The product page's buying panel (FR-UNIT-07, FR-CART-01/08): a tile's own
 * controls, plus what a tile has no room for, the packaging facts and the
 * line note. Nothing is captioned that a control already says.
 */
@Component({
  selector: 'app-product-buy-block',
  imports: [
    Card,
    AutoGrow,
    FieldLabel,
    Input,
    ProductAvailabilityBadge,
    ProductBuyControls,
    ProductPairings,
    ProductSetBadge,
    ProductUnitFacts,
  ],
  template: `
    <!-- At its 15rem floor the panel gives its padding back, so the controls
         keep a tile's 13.5rem (11px: the border is the missing pixel). 15.75rem
         is what full padding costs: 13.5rem + 16px a side + the border. -->
    <div uiCard [padded]="false" class="py-4 px-2.75 @min-[15.75rem]/buy:px-4">
      <!-- Over the price, as on a card: read before what it costs. -->
      <app-product-availability-badge
        class="mb-1"
        [availability]="item().availability"
      />

      <app-product-buy-controls
        [item]="item()"
        [image]="item().images[0]"
        [note]="note()"
        [externalNote]="true"
        [offerPairings]="false"
        [canAdd]="canAdd()"
        [priceNote]="taxNote()"
      >
        <!-- One 12px gap whichever of these a product has; mb-1 plus the
             button's own mt-2 make the gap above it. -->
        <div class="mt-2 mb-1 flex flex-col items-stretch gap-3">
          <app-product-unit-facts [packagingInfo]="packaging()" />

          <!-- Under the packaging it counts: "100 pcs" is a hundred cups with
               their lids. -->
          @if (item().parts.length > 0) {
            <app-product-set-badge
              class="self-start"
              variant="full"
              [parts]="item().parts"
            />
          }

          @if (item().pairedCount > 0) {
            <app-product-pairings
              class="self-start"
              variant="link"
              [slug]="item().slug"
              [count]="item().pairedCount"
            />
          }

          @if (item().lineNoteEnabled) {
            <!-- The product's question is the placeholder: read while the
                 field is empty, the only time it says anything. -->
            <label class="block">
              <span uiFieldLabel>{{ text.noteLabel }}</span>
              <textarea
                uiInput
                uiAutoGrow
                rows="2"
                class="w-full"
                [attr.maxlength]="noteMax"
                [attr.placeholder]="notePrompt()"
                [value]="note()"
                (input)="onNoteInput($event)"
                (change)="saveNote()"
              ></textarea>
            </label>
          }
        </div>
      </app-product-buy-controls>
    </div>
  `,
})
export class ProductBuyBlock {
  protected readonly text = inject(STOREFRONT_TEXT).cart;
  protected readonly noteMax = CART_NOTE_MAX;
  private readonly tax = useTaxStatement();

  readonly item = input.required<ProductDetail>();
  /** False in the editor's preview. */
  readonly canAdd = input(true);
  protected readonly packaging = computed(() => this.item().packaging);
  protected readonly taxNote = computed(() =>
    this.tax.atPrice(this.item().taxRate),
  );

  private readonly cart = inject(CartService);

  /** The cart line's note once the product is in the cart, so an earlier one
   * is not apparently lost; reset with the product. */
  protected readonly note = linkedSignal<string, string>({
    source: () => this.item().slug,
    computation: (slug) => this.cart.lineFor(slug)?.note ?? '',
  });

  protected readonly notePrompt = computed(
    () => this.item().lineNotePrompt ?? this.text.notePrompt,
  );

  protected onNoteInput(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  /** On leaving the field, as a card's bubble does: a sentence, not a
   * keystroke. */

  protected saveNote(): void {
    const note = this.note().trim();
    this.cart.setNote(this.item().slug, note === '' ? null : note);
  }
}
