import {
  Component,
  computed,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Field } from '@b2b-catalog-platform/ui/fields/field';
import { companyIdExamples } from './company-id';
import { PartySuggestInput } from './party-suggest-input';
import { PartySuggestion } from '@b2b-catalog-platform/shared/core/accounts';

/** Two pairs on one page would otherwise share the line's id. */
let nextId = 0;

/**
 * A company's registration number and name as one row; a row picked in either
 * fills both. Messages span the row: the number's column is too narrow to
 * wrap one in. The rules are the form's (`required`, `companyIdFormat`).
 */
@Component({
  selector: 'app-company-fields',
  imports: [Field, PartySuggestInput, ErrorText],
  host: { class: 'block' },
  template: `
    <div>
      <!-- A container: a suggestion panel may cross columns, not the row. -->
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

      <!-- Hidden when empty, so it takes no margin. -->
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

  /** After both fields took it. */
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

  /** A number the provider lacks keeps the typed one. Nothing is locked:
   * the registry fills the form, it does not decide it. */
  protected fill(party: PartySuggestion): void {
    this.nameField()().value.set(party.name);
    if (party.registrationId) {
      this.idField()().value.set(party.registrationId);
    }
    this.picked.emit(party);
  }
}
