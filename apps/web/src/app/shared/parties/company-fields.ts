import {
  Component,
  computed,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { STOREFRONT_TEXT } from '../config/storefront-text';
import { companyIdExamples } from '../core/field-rules';
import { ErrorText } from '../ui/error-text';
import { Field } from '../ui/field';
import { PartySuggestInput } from './party-suggest-input';

export interface CompanyFieldsText {
  readonly idLabel: string;
  readonly nameLabel: string;
  /** `{examples}` is substituted with every shape the deployment accepts. */
  readonly hint?: string;
}

/** Two pairs on one page would otherwise share the line's id. */
let nextId = 0;

/**
 * The two halves of the invoiced party, its registration number and its name,
 * as one row (FR-AUTH-09).
 *
 * One row because they are one answer, laid out like the postcode and the city:
 * a short fixed token beside a long free-text field. Both suggest, from the same
 * endpoint, because the provider takes either as its query, so picking a row in
 * whichever field the customer started in fills the other.
 *
 * The messages sit **under the row**, spanning it, rather than inside the
 * columns: the number's column is ten characters wide, and a format message
 * wrapped into five lines under it is worse than no layout at all. It is also
 * the truth: the two fields describe one thing, and a message about either is
 * a message about the company. Each field still decides when its own message
 * is due; the line only draws what they say.
 *
 * The rules are the form's: `required` and `companyIdFormat` on its paths.
 */
@Component({
  selector: 'app-company-fields',
  imports: [Field, PartySuggestInput, ErrorText],
  host: { class: 'block' },
  template: `
    <div>
      <!-- A container, so a suggestion panel under the ten-character number
           field may cross into the name's column but not past the row. -->
      <div class="@container grid gap-6 sm:grid-cols-[10rem_1fr]">
        <app-field
          [field]="idField()"
          [label]="text().idLabel"
          [controlId]="idInputId()"
          [sharedLine]="lineId"
        >
          <app-party-suggest-input
            [field]="idField()"
            [text]="suggestText"
            (picked)="picked.emit($event)"
          />
        </app-field>

        <app-field
          [field]="nameField()"
          [label]="text().nameLabel"
          [controlId]="nameInputId()"
          [sharedLine]="lineId"
        >
          <app-party-suggest-input
            [field]="nameField()"
            [text]="suggestText"
            autocomplete="organization"
            (picked)="picked.emit($event)"
          />
        </app-field>
      </div>

      <!-- Gone entirely when there is nothing to say, rather than an empty
           grid row: with no hint configured it would still take the row gap,
           and the notice under a company would sit lower than under a
           person. -->
      <div [id]="lineId" class="empty:hidden mt-1">
        @for (message of messages(); track message) {
          <p appErrorText>{{ message }}</p>
        } @empty {
          @if (hint(); as hint) {
            <p class="text-sm text-ink-subtle">{{ hint }}</p>
          }
        }
      </div>
    </div>
  `,
})
export class CompanyFields {
  readonly idField = input.required<FieldTree<string>>();
  readonly nameField = input.required<FieldTree<string>>();
  readonly text = input.required<CompanyFieldsText>();
  readonly idInputId = input('companyId');
  readonly nameInputId = input('companyName');

  /** The whole party the customer picked; the form fills both fields from it. */
  readonly picked = output<PartySuggestion>();

  protected readonly lineId = `company-line-${nextId++}`;
  private readonly examples = companyIdExamples(
    inject(DEPLOYMENT_CONFIG).companyIdInput?.formats,
  );

  /** The type-ahead's wording, the same wherever the pair is asked for. */
  protected readonly suggestText = inject(STOREFRONT_TEXT).companySuggest;

  protected readonly hint = computed(() =>
    this.text().hint?.replace('{examples}', this.examples),
  );

  private readonly fields = viewChildren(Field);
  /** What is wrong, in field order. */
  protected readonly messages = computed(() =>
    this.fields()
      .map((field) => field.error())
      .filter((message) => message !== null),
  );
}
