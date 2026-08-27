import { Component, computed, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  PARTY_QUERY_MIN_LENGTH,
  PartySuggestion,
} from '@b2b-catalog-platform/shared';
import { HighlightedLine } from '../core/highlighted-line';
import { SuggestList, SuggestListText } from '../core/suggest-list';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { PartiesService } from './parties.service';

/** `aria-controls` must name one list, and a form holds two of these. */
let nextId = 0;

/**
 * A field that suggests companies as it is typed (FR-AUTH-09, ADR 0041).
 *
 * Used for **both** company fields — the name and the registration number —
 * because the provider takes either as its query and answers with the whole
 * party. Whichever the customer starts in, picking a row fills the other, which
 * is why neither field is ever disabled to steer them into the "right" one.
 *
 * An ordinary text input first: typing always works, nothing about the form
 * depends on a suggestion arriving, and a deployment with no sidecar gets an
 * empty list and therefore no dropdown.
 *
 * It draws no hint and no message: the pair shares one, under the row (see
 * `CompanyFields`).
 */
@Component({
  selector: 'app-party-suggest-field',
  imports: [ReactiveFormsModule, FieldLabel, Input, HighlightedLine],
  // See PhoneField: a custom element is inline by default, and an inline box
  // drops the vertical margin a form's `space-y-*` puts on it.
  host: { class: 'block' },
  template: `
    <label [for]="inputId()" appFieldLabel>
      {{ label() }}
      @if (required()) {
        <span class="text-accent" aria-hidden="true">*</span>
      } @else if (optionalLabel()) {
        <span class="font-normal text-subtle">({{ optionalLabel() }})</span>
      }
    </label>

    <div class="relative">
      <input
        [id]="inputId()"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        [autocomplete]="autocomplete()"
        [attr.aria-expanded]="list.panelOpen()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeOptionId()"
        [attr.aria-required]="required() || null"
        [attr.aria-invalid]="invalid() || null"
        [formControl]="control()"
        appInput
        class="w-full"
        (input)="list.type($any($event.target).value)"
        (keydown)="keydown($event)"
        (blur)="list.close()"
      />

      @if (list.panelOpen()) {
        <!-- As wide as the field, but never narrower than a company name and
             the number under it: this field shares a row with the other, so
             its own column is too narrow to read a suggestion in. -->
        <div
          class="absolute top-full left-0 z-20 mt-1 w-full max-w-[calc(100vw-2rem)] min-w-[20rem] overflow-hidden rounded-md border border-border-strong bg-white py-1 shadow-lg"
        >
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
                <span class="block truncate font-medium text-stone-800">
                  <app-highlighted-line
                    [line]="item.name"
                    [query]="list.query()"
                  />
                </span>
                <!-- Marked too, because the number is a query in its own right:
                     a customer who typed one is looking for it in the row. -->
                @if (secondLine(item); as second) {
                  <span class="block truncate text-subtle">
                    <app-highlighted-line
                      [line]="second"
                      [query]="list.query()"
                    />
                  </span>
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
export class PartySuggestField {
  private readonly parties = inject(PartiesService);

  readonly control = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly text = input.required<SuggestListText>();
  readonly invalid = input(false);
  readonly required = input(true);
  readonly optionalLabel = input<string>();
  readonly inputId = input('companyName');
  readonly autocomplete = input('off');

  /** The whole party the customer picked — both fields fill from it. */
  readonly picked = output<PartySuggestion>();

  protected readonly listId = `party-suggestions-${nextId++}`;

  protected readonly list = new SuggestList<PartySuggestion>({
    load: (q) => this.parties.suggest(q),
    minLength: PARTY_QUERY_MIN_LENGTH,
  });

  protected readonly activeOptionId = computed(() =>
    this.list.panelOpen() && this.list.activeIndex() >= 0
      ? `${this.listId}-${this.list.activeIndex()}`
      : null,
  );

  /**
   * What tells two rows apart when the names look alike: the number, and where
   * the company is registered. Absent parts are simply left out — a provider
   * answers at whatever granularity it has.
   */
  protected secondLine(item: PartySuggestion): string {
    return [item.registrationId, item.address?.city]
      .filter(Boolean)
      .join(' · ');
  }

  protected keydown(event: KeyboardEvent): void {
    const chosen = this.list.keydown(event);
    if (chosen) this.apply(chosen);
  }

  /** mousedown, not click: the field's own blur would close the panel first. */
  protected pick(event: MouseEvent, item: PartySuggestion): void {
    event.preventDefault();
    this.apply(item);
  }

  private apply(item: PartySuggestion): void {
    this.picked.emit(item);
    this.list.close();
  }
}
