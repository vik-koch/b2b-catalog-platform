import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { CART_NOTE_MAX, ProductDetail } from '@b2b-catalog-platform/shared';
import { CartService } from '../cart/cart.service';
import { APP_TEXT } from '../config/app-text';
import { AutoGrow } from '../ui/auto-grow';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { ProductAvailabilityBadge } from './product-availability-badge';
import { ProductBuyControls } from './product-buy-controls';
import { ProductUnitFacts } from './product-unit-facts';

/**
 * The buying block on a product page (FR-UNIT-07, FR-CART-01/08). The controls
 * are the same component a grid tile carries — a customer who learned the
 * selector on a card finds it unchanged here — and what this adds is the room a
 * tile does not have: the packaging facts at full size, and the note where the
 * product asks for one.
 *
 * It sits beside the photo, above the description rather than below it: a
 * description can be arbitrarily long, and the price and the way to buy are
 * what a returning customer came for.
 *
 * Nothing here is captioned that the control already says. The unit segments
 * read "Piece / Pack / Box" and the quantity is a number with steppers welded
 * to it; a label above either would only repeat it. The two facts that are
 * *not* visible in a control — the minimum and the packaging — get the words.
 */
@Component({
  selector: 'app-product-buy-block',
  imports: [
    AutoGrow,
    FieldLabel,
    Input,
    ProductAvailabilityBadge,
    ProductBuyControls,
    ProductUnitFacts,
  ],
  template: `
    <!-- The padding follows the column: at its 15rem floor the panel gives it
         back, so the controls keep the 13.5rem they have inside a catalogue
         tile. 11px rather than 12 because the panel is a bordered box and the
         tile is not — the border is the pixel a side that would otherwise go
         missing. -->
    <div class="rounded-xl border border-border p-2.75 @min-[17rem]/buy:p-4">
      <app-product-buy-controls
        [item]="item()"
        [image]="item().images[0]"
        [note]="note()"
        [externalNote]="true"
        [canAdd]="canAdd()"
      >
        <app-product-unit-facts class="mt-2" [packagingInfo]="packaging()" />

        @if (item().lineNoteEnabled) {
          <!-- The product's question is the field's placeholder rather than a
               line under it: it says what to write, and it is read while the
               field is empty — the only time it has anything to say. -->
          <label class="mt-4 block">
            <span appFieldLabel>{{ text.noteLabel }}</span>
            <textarea
              appInput
              appAutoGrow
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
      </app-product-buy-controls>

      <!-- Under the button rather than over the name: on a page this size the
           badge is a footnote to the decision to buy, not the first thing read.
           Inside the panel, so it stays with the control it qualifies. -->
      <app-product-availability-badge
        class="mt-3"
        [availability]="item().availability"
      />
    </div>
  `,
})
export class ProductBuyBlock {
  protected readonly text = inject(APP_TEXT).cart;
  protected readonly noteMax = CART_NOTE_MAX;

  readonly item = input.required<ProductDetail>();
  /** False in the product editor's live preview: the block is there to show
   * what a visitor will see, not to fill a manager's own cart. */
  readonly canAdd = input(true);
  protected readonly packaging = computed(() => this.item().packaging);

  private readonly cart = inject(CartService);

  /**
   * Seeded from the cart's line, so a note written on a previous visit is on
   * screen rather than apparently lost — this field *is* that note once the
   * product is in the cart. Reset with the product: a note belongs to the line
   * it was typed for.
   */
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

  /** Written to the line when the field is left, the same moment the bubble on
   * a card writes its own — the note is a sentence, not a keystroke. */
  protected saveNote(): void {
    const note = this.note().trim();
    this.cart.setNote(this.item().slug, note === '' ? null : note);
  }
}
