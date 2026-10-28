import { Component, inject, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import {
  ADDRESS_QUERY_MIN_LENGTH,
  AddressComponents,
  AddressSuggestion,
} from '@b2b-catalog-platform/shared';
import { HighlightedLine } from '../ui/highlighted-line';
import { MatchSegmentsPipe } from '../catalog/match-segments.pipe';
import { SuggestList, SuggestListText } from '../ui/suggest-list';
import { FieldBinding } from '@b2b-catalog-platform/ui/fields/field-binding';
import { Input } from '../ui/input';
import { SuggestField } from '../ui/suggest-field';
import { SuggestInput } from '../ui/suggest-input';
import { SuggestRow } from '../ui/suggest-row';
import { AddressesService } from './addresses.service';

/**
 * The street input inside a Field, with suggestions where a deployment
 * configures a provider (FR-CART-11, ADR 0040). Its length is the schema's
 * `maxLength`, which FormField sets on it. An ordinary text input first: typing always works,
 * nothing about the form depends on a suggestion arriving, and a deployment
 * with no adapter gets an empty list and therefore no dropdown.
 *
 * Picking a row emits the provider's **components**, which the form spreads
 * across its own controls — the postal code especially, since the delivery
 * zone is decided from it.
 */
@Component({
  selector: 'app-address-suggest-input',
  imports: [
    FormField,
    FieldBinding,
    Input,
    HighlightedLine,
    MatchSegmentsPipe,
    SuggestField,
    SuggestInput,
    SuggestRow,
  ],
  host: { class: 'block' },
  template: `
    <app-suggest-field
      [list]="list"
      [text]="text()"
      width="lg"
      (picked)="picked.emit($event.components)"
    >
      <input
        autocomplete="street-address"
        [formField]="field()"
        appInput
        appSuggestInput
        class="w-full"
      />
      <ng-template appSuggestRow [of]="list" let-item let-query="query">
        <span class="block truncate text-ink">
          <app-highlighted-line
            [segments]="item.label | matchSegments: query"
          />
        </span>
        <!-- The province under the line, where the provider named one: it is
             the part the line itself leaves out, and two streets of the same
             name in two towns are otherwise one row repeated. -->
        @if (item.components.region; as region) {
          <span class="block truncate text-xs text-ink-subtle">{{
            region
          }}</span>
        }
      </ng-template>
    </app-suggest-field>
  `,
})
export class AddressSuggestInput {
  private readonly addresses = inject(AddressesService);

  readonly field = input.required<FieldTree<string>>();
  readonly text = input.required<SuggestListText>();
  /** Biases the provider; the form's own country picker feeds it. */
  readonly country = input<string | undefined>(undefined);

  /** The components of the row the customer picked. */
  readonly picked = output<AddressComponents>();

  protected readonly list = new SuggestList<AddressSuggestion>({
    load: (q) => this.addresses.suggest(q, this.country()),
    minLength: ADDRESS_QUERY_MIN_LENGTH,
    dependsOn: () => this.country(),
  });
}
