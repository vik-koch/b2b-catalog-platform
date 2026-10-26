import {
  booleanAttribute,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { type FieldTree } from '@angular/forms/signals';
import { ErrorText } from './error-text';
import { FieldLabel } from './field-label';
import { Hint } from './hint';
import { SubmitAttempt } from './submit-attempt';

let nextId = 0;

/**
 * One form field: its caption, the required mark, a hint and the error line
 * around a projected control, all read from the field it is given. The mark
 * and the control's `required` come from the same schema rule, so they cannot
 * disagree.
 *
 * When the error shows is decided here, the same way for every form:
 *
 * 1. A valid field never shows one.
 * 2. A missing required value waits for the first submit. Tabbing through a
 *    form to see what it asks for is not a mistake.
 * 3. Any other error shows once the field is left, and hides again as soon as
 *    it is edited: "j" is an unfinished address, not a wrong one, however
 *    often the visitor starts over.
 *
 *   <app-field [field]="form.name" [label]="text.name">
 *     <input appInput class="w-full" [formField]="form.name" />
 *   </app-field>
 *
 * `group` draws a fieldset and legend instead, for a control made of several
 * inputs (a segmented choice, a radio list), which no one label can name.
 * Templates import it through FORM_FIELDS, with the directives it relies on.
 */
@Component({
  selector: 'app-field',
  imports: [NgTemplateOutlet, ErrorText, FieldLabel, Hint],
  host: {
    class: 'block',
    '(focusout)': 'leave($event)',
    // Change as well as input: a select or a checkbox never fires input.
    '(input)': 'left.set(false)',
    '(change)': 'left.set(false)',
  },
  template: `
    <ng-template #control><ng-content /></ng-template>
    <ng-template #mark>
      @if (marked()) {
        <span class="text-accent" aria-hidden="true">*</span>
      }
    </ng-template>

    @if (group()) {
      <fieldset [attr.aria-describedby]="describedBy()">
        <legend appFieldLabel>
          {{ label() }}
          <ng-container [ngTemplateOutlet]="mark" />
        </legend>
        <!-- Above the control: a group's hint says what the set is for. -->
        @if (hint(); as hint) {
          <p appHint [id]="hintId()" class="mb-2">{{ hint }}</p>
        }
        <ng-container [ngTemplateOutlet]="control" />
        @if (error(); as error) {
          <p appErrorText [id]="errorId()" class="mt-1">{{ error }}</p>
        }
      </fieldset>
    } @else {
      <label [for]="controlId()" appFieldLabel>
        {{ label() }}
        <ng-container [ngTemplateOutlet]="mark" />
      </label>
      <ng-container [ngTemplateOutlet]="control" />
      @if (error(); as error) {
        <p appErrorText [id]="errorId()" class="mt-1">{{ error }}</p>
      } @else if (hint(); as hint) {
        <p appHint [id]="hintId()" class="mt-1">{{ hint }}</p>
      }
    }
  `,
})
export class Field<T> {
  readonly field = input.required<FieldTree<T>>();
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly group = input(false, { transform: booleanAttribute });
  /**
   * The `*` beside the caption. Off on a form where every field is required:
   * marking all of them marks none.
   */
  readonly marker = input(true);
  /** Given where a test or a link has to find the control by it. */
  readonly controlId = input(`field-${nextId++}`);

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly attempt = inject(SubmitAttempt, { optional: true });
  /** Rule 3: left since its last edit. */
  protected readonly left = signal(false);

  readonly required = computed(() => this.field()().required());
  protected readonly marked = computed(() => this.marker() && this.required());

  /** The message due on screen now, or null. */
  readonly error = computed(() => {
    const state = this.field()();
    if (!state.invalid()) return null;
    const attempted = this.attempt?.attempted() ?? false;
    if (!attempted && (!this.left() || state.getError('required'))) {
      return null;
    }
    return state.errors().find((error) => error.message)?.message ?? null;
  });

  protected readonly hintId = computed(() => `${this.controlId()}-hint`);
  protected readonly errorId = computed(() => `${this.controlId()}-error`);
  /** Under a single control the error takes the hint's place; a group keeps both. */
  readonly describedBy = computed(() => {
    const hint = this.hint() && (this.group() || !this.error());
    const ids = [hint && this.hintId(), this.error() && this.errorId()];
    return ids.filter(Boolean).join(' ') || null;
  });

  protected leave(event: FocusEvent): void {
    // Moving between the parts of one control is not leaving it.
    if (!this.host.contains(event.relatedTarget as Node | null)) {
      this.left.set(true);
    }
  }
}
