import { Component, inject, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { HighlightedLine } from '@b2b-catalog-platform/ui/suggest/highlighted-line';
import { Suggestion } from '@b2b-catalog-platform/ui/suggest/suggestion';
import { MatchSegmentsPipe } from '../../catalog/search/match-segments.pipe';
import { SuggestList } from '@b2b-catalog-platform/ui/suggest/suggest-list';
import { FieldBinding } from '@b2b-catalog-platform/ui/fields/field-binding';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SuggestField } from '@b2b-catalog-platform/ui/suggest/suggest-field';
import { SuggestInput } from '@b2b-catalog-platform/ui/suggest/suggest-input';
import { SuggestRow } from '@b2b-catalog-platform/ui/suggest/suggest-row';
import { PartiesService } from './parties.service';
import {
  PARTY_QUERY_MIN_LENGTH,
  PartySuggestion,
} from '@b2b-catalog-platform/shared/core/accounts';

/**
 * A company input for either half, name or number: the provider takes both as
 * a query and answers with the whole party. Without a provider it is a plain
 * input.
 */
@Component({
  selector: 'app-party-suggest-input',
  imports: [
    FormField,
    FieldBinding,
    Input,
    HighlightedLine,
    Suggestion,
    MatchSegmentsPipe,
    SuggestField,
    SuggestInput,
    SuggestRow,
  ],
  host: { class: 'block' },
  template: `
    <!-- Wider than its column: the number's is too narrow for a name. -->
    <ui-suggest-field
      [list]="list"
      [text]="text"
      width="md"
      (picked)="picked.emit($event)"
    >
      <input
        [autocomplete]="autocomplete()"
        [formField]="field()"
        uiInput
        uiSuggestInput
        class="w-full"
      />
      <ng-template uiSuggestRow [of]="list" let-item let-query="query">
        <ui-suggestion [segments]="item.name | matchSegments: query">
          <!-- Marked too: a typed number is looked for in the row. -->
          @if (secondLine(item); as second) {
            <ui-highlighted-line [segments]="second | matchSegments: query" />
          }
        </ui-suggestion>
      </ng-template>
    </ui-suggest-field>
  `,
})
export class PartySuggestInput {
  private readonly parties = inject(PartiesService);

  protected readonly text = inject(STOREFRONT_TEXT).companySuggest;

  readonly field = input.required<FieldTree<string>>();
  readonly autocomplete = input('off');

  readonly picked = output<PartySuggestion>();

  protected readonly list = new SuggestList<PartySuggestion>({
    load: (q) => this.parties.suggest(q),
    minLength: PARTY_QUERY_MIN_LENGTH,
  });

  /** What tells alike names apart; a provider may answer neither. */
  protected secondLine(item: PartySuggestion): string {
    return [item.registrationId, item.address?.city]
      .filter(Boolean)
      .join(' · ');
  }
}
