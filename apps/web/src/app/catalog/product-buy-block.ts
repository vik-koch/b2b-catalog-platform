import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { CART_NOTE_MAX, ProductDetail } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { ProductBuyControls } from './product-buy-controls';
import { ProductUnitFacts } from './product-unit-facts';

/**
 * The buying block on a product page (FR-UNIT-07, FR-CART-01/08). The controls
 * are the same component a grid tile carries — a customer who learned the
 * selector on a card finds it unchanged here — and what this adds is the room a
 * tile does not have: the packaging facts at full size, and the note where the
 * product asks for one.
 *
 * It sits above the description rather than below it: a description can be
 * arbitrarily long, and the price and the way to buy are what a returning
 * customer came for.
 *
 * Nothing here is captioned that the control already says. The unit segments
 * read "Piece / Pack / Box" and the quantity is a number with steppers welded
 * to it; a label above either would only repeat it. The two facts that are
 * *not* visible in a control — the minimum and the packaging — get the words.
 */
@Component({
  selector: 'app-product-buy-block',
  imports: [FieldLabel, Input, ProductBuyControls, ProductUnitFacts],
  template: `
    <div class="rounded-xl border border-border p-3">
      <app-product-buy-controls
        [item]="item()"
        [note]="note()"
        [canAdd]="canAdd()"
      >
        <app-product-unit-facts class="mt-2" [packagingInfo]="packaging()" />

        @if (item().lineNoteEnabled) {
          <label class="mt-4 block">
            <span appFieldLabel>{{ text.noteLabel }}</span>
            <textarea
              appInput
              rows="2"
              class="w-full"
              [attr.maxlength]="noteMax"
              [value]="note()"
              (input)="onNoteInput($event)"
            ></textarea>
            <span class="mt-1 block text-xs text-subtle">{{
              notePrompt()
            }}</span>
          </label>
        }
      </app-product-buy-controls>
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

  /** Cleared when the product changes: a note belongs to the line it was
   * typed for. */
  protected readonly note = linkedSignal<string, string>({
    source: () => this.item().slug,
    computation: () => '',
  });

  protected readonly notePrompt = computed(
    () => this.item().lineNotePrompt ?? this.text.notePrompt,
  );

  protected onNoteInput(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }
}
