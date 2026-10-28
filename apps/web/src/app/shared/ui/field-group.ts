import { Component, computed, inject, input } from '@angular/core';
import { ErrorText } from './error-text';
import { FieldLabel } from './field-label';
import { FieldStatus } from './field-status';
import { Hint } from './hint';
import { UI_TEXT } from '@b2b-catalog-platform/ui/core/ui-text';

let nextId = 0;

/**
 * Field for a control made of several inputs (radios, a segmented choice),
 * which no one label can name: a fieldset and legend carry the caption and the
 * description, and the inputs inside keep none of their own.
 *
 *   <app-field-group [field]="form.size" [label]="text.size">
 *     <app-segmented [options]="sizes" [formField]="form.size" />
 *   </app-field-group>
 */
@Component({
  selector: 'app-field-group',
  imports: [ErrorText, FieldLabel, Hint],
  hostDirectives: [{ directive: FieldStatus, inputs: ['field'] }],
  host: { class: 'block' },
  template: `
    <fieldset [attr.aria-describedby]="descriptionIds()">
      <legend appFieldLabel>
        {{ label() }}
        @if (marker() && required()) {
          <span class="text-accent" aria-hidden="true">*</span>
        } @else if (optional() && !required()) {
          <span class="font-normal text-ink-subtle">({{ optional() }})</span>
        }
        <ng-content select="[appFieldCaption]" />
        <!-- A fieldset takes no aria-required, so the word joins its name. -->
        @if (required() && requiredWord) {
          <span class="sr-only">{{ requiredWord }}</span>
        }
      </legend>
      <!-- Above the inputs: it says what the set is for. -->
      @if (hint(); as hint) {
        <p appHint [id]="hintId" class="mb-2">{{ hint }}</p>
      }
      <ng-content />
      @if (error(); as error) {
        <p appErrorText [id]="errorId" class="mt-1">{{ error }}</p>
      }
    </fieldset>
  `,
})
export class FieldGroup {
  private readonly status = inject(FieldStatus);

  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly marker = input(true);
  readonly optional = input<string>();
  readonly describedBy = input<string>();

  /** Optional, so a spec that renders a group needs no texts for it. */
  protected readonly requiredWord = inject(UI_TEXT, { optional: true })
    ?.required;

  protected readonly required = this.status.required;
  protected readonly error = this.status.error;

  private readonly id = `field-group-${nextId++}`;
  protected readonly hintId = `${this.id}-hint`;
  protected readonly errorId = `${this.id}-error`;
  /** Unlike Field, the hint stays beside the error: it names the set. */
  protected readonly descriptionIds = computed(() => {
    const ids = [
      this.hint() && this.hintId,
      this.error() && this.errorId,
      this.describedBy(),
    ];
    return ids.filter(Boolean).join(' ') || null;
  });
}
