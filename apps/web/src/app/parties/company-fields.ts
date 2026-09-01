import { Component, inject, input, output } from '@angular/core';
import { FormControl } from '@angular/forms';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { SuggestListText } from '../core/suggest-list';
import { PartySuggestField } from './party-suggest-field';

export interface CompanyFieldsText extends SuggestListText {
  readonly idLabel: string;
  readonly nameLabel: string;
  /** `{examples}` is substituted with every shape the deployment accepts. */
  readonly hint?: string;
  readonly idFormat: string;
  /** Only where the pair is required — an address's company is optional. */
  readonly idRequired?: string;
  readonly nameRequired?: string;
  /** The "(optional)" marker, where it is not. */
  readonly optional?: string;
}

/**
 * The two halves of the invoiced party — its registration number and its name —
 * as one row (FR-AUTH-09).
 *
 * One row because they are one answer, laid out like the postcode and the city:
 * a short fixed token beside a long free-text field. Both suggest, from the same
 * endpoint, because the provider takes either as its query — so picking a row in
 * whichever field the customer started in fills the other, and neither is ever
 * disabled to steer them into the "right" one.
 *
 * The messages sit **under the row**, spanning it, rather than inside the
 * columns: the number's column is ten characters wide, and a format message
 * wrapped into five lines under it is worse than no layout at all. It is also
 * the truth — the two fields describe one thing, and a message about either is a
 * message about the company.
 */
@Component({
  selector: 'app-company-fields',
  imports: [PartySuggestField],
  host: { class: 'block' },
  template: `
    <div>
      <!-- A container, so a suggestion panel under the ten-character number
           field may cross into the name's column but not past the row. -->
      <div class="@container grid gap-6 sm:grid-cols-[10rem_1fr]">
        <app-party-suggest-field
          [inputId]="idInputId()"
          [control]="idControl()"
          [label]="text().idLabel"
          [text]="suggestText()"
          [required]="required()"
          [optionalLabel]="text().optional"
          [invalid]="idInvalid()"
          (picked)="picked.emit($event)"
        />

        <app-party-suggest-field
          [inputId]="nameInputId()"
          autocomplete="organization"
          [control]="nameControl()"
          [label]="text().nameLabel"
          [text]="suggestText()"
          [required]="required()"
          [optionalLabel]="text().optional"
          [invalid]="nameInvalid()"
          (picked)="picked.emit($event)"
        />
      </div>

      <!-- Gone entirely when there is nothing to say, rather than an empty
           grid row: with no hint configured it would still take the row gap,
           and the notice under a company would sit lower than under a
           person. -->
      <div class="empty:hidden mt-1">
        @for (message of messages(); track message) {
          <p class="text-sm text-red-600">{{ message }}</p>
        } @empty {
          @if (hint()) {
            <p class="text-sm text-muted">{{ hint() }}</p>
          }
        }
      </div>
    </div>
  `,
})
export class CompanyFields {
  readonly idControl = input.required<FormControl<string>>();
  readonly nameControl = input.required<FormControl<string>>();
  readonly text = input.required<CompanyFieldsText>();

  /** Whether the form's FieldErrors says each field's message is due. */
  readonly idInvalid = input(false);
  readonly nameInvalid = input(false);
  readonly required = input(true);
  readonly idInputId = input('companyId');
  readonly nameInputId = input('companyName');

  /** The whole party the customer picked; the form fills both fields from it. */
  readonly picked = output<PartySuggestion>();

  /**
   * Every accepted shape, in one list. The field asks for a number, not for a
   * kind of number, so the hint and the message name all of them rather than
   * whichever one a picker happened to be on.
   */
  private readonly examples = (
    inject(DEPLOYMENT_CONFIG).companyIdInput?.formats ?? []
  )
    .map((format) => format.example)
    // A comma, not a word: the wording around it is the deployment's, and a
    // hardcoded "or" here would be one English word inside a localized string.
    .join(', ');

  /** Only the type-ahead half of the wording reaches the fields themselves. */
  protected suggestText(): SuggestListText {
    const { suggestionsLabel, noSuggestions, suggestionCount } = this.text();
    return { suggestionsLabel, noSuggestions, suggestionCount };
  }

  protected hint(): string | undefined {
    return this.text().hint?.replace('{examples}', this.examples);
  }

  /**
   * What is wrong, in field order. Methods rather than computeds: a
   * FormControl's error state is not a signal, so a computed would cache the
   * first answer it produced. The view is re-rendered when `idInvalid` or
   * `nameInvalid` flips, which is exactly when this changes.
   */
  protected messages(): string[] {
    const text = this.text();
    const messages: string[] = [];

    if (this.idInvalid()) {
      messages.push(
        this.idControl().hasError('required') && text.idRequired
          ? text.idRequired
          : text.idFormat.replace('{examples}', this.examples),
      );
    }
    if (this.nameInvalid() && text.nameRequired) {
      messages.push(text.nameRequired);
    }
    return messages;
  }
}
