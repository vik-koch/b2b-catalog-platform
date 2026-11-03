import {
  Component,
  computed,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';
import { fillText } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Field } from '@b2b-catalog-platform/ui/fields/field';
import { companyIdExamples } from './company-id';
import { PartySuggestInput } from './party-suggest-input';
import { PartySuggestion } from '@b2b-catalog-platform/shared/core/accounts';

/** Two pairs on one page would otherwise share the line's id. */
let nextId = 0;

/**
 * The two halves of the invoiced party, its registration number and its name,
 * as one row (FR-AUTH-09).
 *
 * One row because they are one answer, laid out like the postcode and the city:
 * a short fixed token beside a long free-text field. Both suggest, from the same
 * endpoint, because the provider takes either as its query, so picking a row in
 * whichever field the customer started in fills both.
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
        <ui-field
          [field]="idField()"
          [label]="labels.companyId.label"
          [controlId]="idInputId()"
          [sharedLine]="lineId"
        >
          <app-party-suggest-input
            [field]="idField()"
            (picked)="fill($event)"
          />
        </ui-field>

        <ui-field
          [field]="nameField()"
          [label]="labels.companyName.label"
          [controlId]="nameInputId()"
          [sharedLine]="lineId"
        >
          <app-party-suggest-input
            [field]="nameField()"
            autocomplete="organization"
            (picked)="fill($event)"
          />
        </ui-field>
      </div>

      <!-- Gone entirely when there is nothing to say, rather than an empty
           grid row: with no hint configured it would still take the row gap,
           and the notice under a company would sit lower than under a
           person. -->
      <div [id]="lineId" class="empty:hidden mt-1">
        @for (message of messages(); track message) {
          <p uiErrorText>{{ message }}</p>
        } @empty {
          @if (filledHint(); as hint) {
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
  /** `{examples}` is filled with every shape the deployment accepts. */
  readonly hint = input<string>();
  readonly idInputId = input('companyId');
  readonly nameInputId = input('companyName');

  /** The whole party the customer picked, after both fields took it. */
  readonly picked = output<PartySuggestion>();

  protected readonly labels = inject(SHARED_TEXT).fields;
  protected readonly lineId = `company-line-${nextId++}`;
  private readonly examples = companyIdExamples(
    inject(DEPLOYMENT_CONFIG).companyIdInput?.formats,
  );

  protected readonly filledHint = computed(() => {
    const hint = this.hint();
    return hint && fillText(hint, { examples: this.examples });
  });

  private readonly fields = viewChildren(Field);
  /** What is wrong, in field order. */
  protected readonly messages = computed(() =>
    this.fields()
      .map((field) => field.error())
      .filter((message) => message !== null),
  );

  /**
   * Only what the provider answered is written, so a partial answer keeps what
   * was typed, and nothing is locked: the registry fills the form, it does not
   * decide it.
   */
  protected fill(party: PartySuggestion): void {
    this.nameField()().value.set(party.name);
    if (party.registrationId) {
      this.idField()().value.set(party.registrationId);
    }
    this.picked.emit(party);
  }
}
