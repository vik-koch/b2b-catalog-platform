import { Component, inject, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import {
  PARTY_QUERY_MIN_LENGTH,
  PartySuggestion,
} from '@b2b-catalog-platform/shared';
import { HighlightedLine } from '../ui/highlighted-line';
import { MatchSegmentsPipe } from '../catalog/match-segments.pipe';
import { SuggestList, SuggestListText } from '../ui/suggest-list';
import { FieldBinding } from '@b2b-catalog-platform/ui/fields/field-binding';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SuggestField } from '../ui/suggest-field';
import { SuggestInput } from '../ui/suggest-input';
import { SuggestRow } from '../ui/suggest-row';
import { PartiesService } from './parties.service';

/**
 * A text input that suggests companies as it is typed (FR-AUTH-09, ADR 0041),
 * inside a Field that names it.
 *
 * Used for **both** company fields, the name and the registration number,
 * because the provider takes either as its query and answers with the whole
 * party. Whichever the customer starts in, picking a row fills the other, which
 * is why neither field is ever disabled to steer them into the "right" one.
 *
 * An ordinary text input first: typing always works, nothing about the form
 * depends on a suggestion arriving, and a deployment with no sidecar gets an
 * empty list and therefore no dropdown.
 */
@Component({
  selector: 'app-party-suggest-input',
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
    <!-- Wider than its column: this field shares a row with the other, which
         is too narrow to read a company name in. -->
    <app-suggest-field
      [list]="list"
      [text]="text()"
      width="md"
      (picked)="picked.emit($event)"
    >
      <input
        [autocomplete]="autocomplete()"
        [formField]="field()"
        appInput
        appSuggestInput
        class="w-full"
      />
      <ng-template appSuggestRow [of]="list" let-item let-query="query">
        <span class="block truncate font-medium text-ink">
          <app-highlighted-line [segments]="item.name | matchSegments: query" />
        </span>
        <!-- Marked too, because the number is a query in its own right: a
             customer who typed one is looking for it in the row. -->
        @if (secondLine(item); as second) {
          <span class="block truncate text-ink-subtle">
            <app-highlighted-line [segments]="second | matchSegments: query" />
          </span>
        }
      </ng-template>
    </app-suggest-field>
  `,
})
export class PartySuggestInput {
  private readonly parties = inject(PartiesService);

  readonly field = input.required<FieldTree<string>>();
  readonly text = input.required<SuggestListText>();
  readonly autocomplete = input('off');

  /** The whole party the customer picked: both fields fill from it. */
  readonly picked = output<PartySuggestion>();

  protected readonly list = new SuggestList<PartySuggestion>({
    load: (q) => this.parties.suggest(q),
    minLength: PARTY_QUERY_MIN_LENGTH,
  });

  /**
   * What tells two rows apart when the names look alike: the number, and where
   * the company is registered. Absent parts are simply left out: a provider
   * answers at whatever granularity it has.
   */
  protected secondLine(item: PartySuggestion): string {
    return [item.registrationId, item.address?.city]
      .filter(Boolean)
      .join(' · ');
  }
}
