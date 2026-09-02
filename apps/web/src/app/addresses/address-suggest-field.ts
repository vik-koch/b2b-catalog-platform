import { Component, computed, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  ADDRESS_LINE_MAX_LENGTH,
  ADDRESS_QUERY_MIN_LENGTH,
  AddressComponents,
  AddressSuggestion,
} from '@b2b-catalog-platform/shared';
import { HighlightedLine } from '../core/highlighted-line';
import {
  SUGGEST_PANEL,
  SuggestList,
  SuggestListText,
} from '../core/suggest-list';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AddressesService } from './addresses.service';

/** `aria-controls` must name one list, and a form may hold two of these. */
let nextId = 0;

export type AddressSuggestFieldText = SuggestListText;

/**
 * The street field, with suggestions where a deployment configures a provider
 * (FR-CART-11, ADR 0040). An ordinary text input first: typing always works,
 * nothing about the form depends on a suggestion arriving, and a deployment
 * with no adapter gets an empty list and therefore no dropdown.
 *
 * Picking a row emits the provider's **components**, which the form spreads
 * across its own controls — the postal code especially, since the delivery
 * zone is decided from it.
 */
@Component({
  selector: 'app-address-suggest-field',
  imports: [ReactiveFormsModule, FieldLabel, Input, HighlightedLine],
  // See PhoneField: a custom element is inline by default, and an inline box
  // drops the vertical margin a form's `space-y-*` puts on it.
  host: { class: 'block' },
  template: `
    <label [for]="inputId" appFieldLabel>
      {{ label() }}
      <span class="text-accent" aria-hidden="true">*</span>
    </label>

    <div class="relative">
      <input
        [id]="inputId"
        type="text"
        autocomplete="street-address"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="list.panelOpen()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeOptionId()"
        [attr.aria-invalid]="invalid() || null"
        [attr.maxlength]="maxLength"
        [formControl]="control()"
        appInput
        class="w-full"
        (input)="list.type($any($event.target).value)"
        (keydown)="keydown($event)"
        (blur)="list.close()"
      />

      @if (list.panelOpen()) {
        <div [class]="panel">
          @if (list.suggestions().length === 0) {
            <p class="px-3 py-2 text-sm text-subtle">
              {{ text().noSuggestions }}
            </p>
          }
          <ul
            [id]="listId"
            role="listbox"
            [attr.aria-label]="text().suggestionsLabel"
          >
            @for (item of list.suggestions(); track $index; let i = $index) {
              <li
                [id]="listId + '-' + i"
                role="option"
                [attr.aria-selected]="i === list.activeIndex()"
                class="cursor-pointer px-3 py-2 text-sm"
                [class.bg-stone-100]="i === list.activeIndex()"
                (mouseenter)="list.activeIndex.set(i)"
                (mousedown)="pick($event, item)"
              >
                <span class="block truncate text-stone-800">
                  <app-highlighted-line
                    [line]="item.label"
                    [query]="list.query()"
                  />
                </span>
                <!-- The province under the line, where the provider named one:
                     it is the part the line itself leaves out, and two streets
                     of the same name in two towns are otherwise one row
                     repeated. -->
                @if (item.components.region; as region) {
                  <span class="block truncate text-xs text-subtle">{{
                    region
                  }}</span>
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>

    <p aria-live="polite" class="sr-only">{{ list.announcement(text()) }}</p>
  `,
})
export class AddressSuggestField {
  private readonly addresses = inject(AddressesService);

  readonly control = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly text = input.required<AddressSuggestFieldText>();
  readonly invalid = input(false);
  /** Biases the provider; the form's own country picker feeds it. */
  readonly country = input<string | undefined>(undefined);

  /** The components of the row the customer picked. */
  readonly picked = output<AddressComponents>();

  /** Wide enough for a street, a postcode and a town on one line, where the
   * form has that much room to give. */
  protected readonly panel = `${SUGGEST_PANEL} min-w-[min(26rem,100cqw)]`;

  protected readonly maxLength = ADDRESS_LINE_MAX_LENGTH;
  protected readonly inputId = `address-street-${nextId}`;
  protected readonly listId = `address-suggestions-${nextId++}`;

  /** The shared type-ahead behaviour; only what to ask and what to draw is
   * this field's own. */
  protected readonly list = new SuggestList<AddressSuggestion>({
    load: (q) => this.addresses.suggest(q, this.country()),
    minLength: ADDRESS_QUERY_MIN_LENGTH,
    dependsOn: () => this.country(),
  });

  protected readonly activeOptionId = computed(() =>
    this.list.panelOpen() && this.list.activeIndex() >= 0
      ? `${this.listId}-${this.list.activeIndex()}`
      : null,
  );

  protected keydown(event: KeyboardEvent): void {
    const chosen = this.list.keydown(event);
    if (chosen) this.apply(chosen);
  }

  /** mousedown, not click: the field's own blur would close the panel first. */
  protected pick(event: MouseEvent, item: AddressSuggestion): void {
    event.preventDefault();
    this.apply(item);
  }

  private apply(item: AddressSuggestion): void {
    this.picked.emit(item.components);
    this.list.close();
  }
}
