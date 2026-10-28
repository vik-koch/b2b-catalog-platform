import {
  Component,
  computed,
  contentChild,
  inject,
  input,
} from '@angular/core';
import { ErrorText } from './error-text';
import { FieldAction } from './field-action';
import { FieldLabel } from './field-label';
import { FieldStatus } from './field-status';
import { Hint } from './hint';

let nextId = 0;

/**
 * One form control with its caption, required mark, hint and error line, all
 * read from the field it is given, so the mark and the control's `required`
 * cannot disagree. FieldStatus decides when the error shows. An element
 * marked `uiFieldCaption` joins the caption after the mark; `uiFieldAction`
 * stands at the end of the caption row. A control made of several inputs is a
 * FieldGroup.
 *
 *   <ui-field [field]="form.name" [label]="text.name">
 *     <input uiInput class="w-full" [formField]="form.name" />
 *   </ui-field>
 */
@Component({
  selector: 'ui-field',
  imports: [ErrorText, FieldLabel, Hint],
  hostDirectives: [{ directive: FieldStatus, inputs: ['field'] }],
  host: { class: 'block' },
  template: `
    <div [class]="action() ? 'flex items-baseline justify-between' : ''">
      <label [for]="controlId()" uiFieldLabel>
        {{ label() }}
        @if (marker() && required()) {
          <span class="text-accent" aria-hidden="true">*</span>
        } @else if (optional() && !required()) {
          <span class="font-normal text-ink-subtle">({{ optional() }})</span>
        }
        <ng-content select="[uiFieldCaption]" />
      </label>
      <ng-content select="[uiFieldAction]" />
    </div>
    <ng-content />
    @if (!sharedLine()) {
      @if (error(); as error) {
        <p uiErrorText [id]="errorId()" class="mt-1">{{ error }}</p>
      } @else if (hint(); as hint) {
        <p uiHint [id]="hintId()" class="mt-1">{{ hint }}</p>
      }
    }
  `,
})
export class Field {
  private readonly status = inject(FieldStatus);

  readonly label = input.required<string>();
  readonly hint = input<string>();
  /** The `*`. Off on a form where every field is required: marking all marks none. */
  readonly marker = input(true);
  /** The word for "optional", on a form where most fields are required. */
  readonly optional = input<string>();
  readonly controlId = input(`field-${nextId++}`);
  /** Further lines that describe the control, such as a server's answer. */
  readonly describedBy = input<string>();
  /**
   * A line outside the field that draws its hint and error, for fields sharing
   * one under their row. It reads `error()`: the timing stays the field's.
   */
  readonly sharedLine = input<string>();

  protected readonly action = contentChild(FieldAction);

  readonly required = this.status.required;
  readonly error = this.status.error;

  protected readonly hintId = computed(() => `${this.controlId()}-hint`);
  protected readonly errorId = computed(() => `${this.controlId()}-error`);
  /** The error takes the hint's place. */
  readonly descriptionIds = computed(() => {
    const shared = this.sharedLine();
    const line = shared
      ? shared
      : this.error()
        ? this.errorId()
        : this.hint() && this.hintId();
    return [line, this.describedBy()].filter(Boolean).join(' ') || null;
  });
}
