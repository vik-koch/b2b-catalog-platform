import { Component, inject, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';

import {
  ADDRESS_QUERY_MIN_LENGTH,
  AddressComponents,
  AddressSuggestion,
} from '@b2b-catalog-platform/shared/core/accounts';
import { FieldBinding } from '@b2b-catalog-platform/ui/fields/field-binding';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SuggestField } from '@b2b-catalog-platform/ui/suggest/suggest-field';
import { SuggestInput } from '@b2b-catalog-platform/ui/suggest/suggest-input';
import { SuggestList } from '@b2b-catalog-platform/ui/suggest/suggest-list';
import { SuggestRow } from '@b2b-catalog-platform/ui/suggest/suggest-row';
import { Suggestion } from '@b2b-catalog-platform/ui/suggest/suggestion';

import { MatchSegmentsPipe } from '../../../platform/search/match-segments.pipe';
import { SHARED_ACCOUNTS_TEXT } from '../accounts-text';
import { AddressesService } from './addresses.service';

/**
 * The street input, suggesting where the deployment has a provider: without
 * one the list stays empty and it is a plain input. A pick emits the
 * components for the form to spread, not the row's label.
 */
@Component({
  selector: 'app-address-suggest-input',
  imports: [
    FormField,
    FieldBinding,
    Input,
    Suggestion,
    MatchSegmentsPipe,
    SuggestField,
    SuggestInput,
    SuggestRow,
  ],
  host: { class: 'block' },
  template: `
    <ui-suggest-field
      [list]="list"
      [text]="text"
      width="lg"
      (picked)="picked.emit($event.components)"
    >
      <input
        autocomplete="street-address"
        [formField]="field()"
        uiInput
        uiSuggestInput
        class="w-full"
      />
      <ng-template uiSuggestRow [of]="list" let-item let-query="query">
        <!-- The region tells apart two streets of one name in two towns. -->
        <ui-suggestion [segments]="item.label | matchSegments: query">
          @if (item.components.region; as region) {
            {{ region }}
          }
        </ui-suggestion>
      </ng-template>
    </ui-suggest-field>
  `,
})
export class AddressSuggestInput {
  private readonly addresses = inject(AddressesService);

  protected readonly text = inject(SHARED_ACCOUNTS_TEXT).address.suggest;

  readonly field = input.required<FieldTree<string>>();
  /** Biases the provider. */
  readonly country = input<string | undefined>(undefined);

  readonly picked = output<AddressComponents>();

  protected readonly list = new SuggestList<AddressSuggestion>({
    load: (q) => this.addresses.suggest(q, this.country()),
    minLength: ADDRESS_QUERY_MIN_LENGTH,
    dependsOn: () => this.country(),
  });
}
