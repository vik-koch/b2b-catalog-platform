import {
  booleanAttribute,
  Component,
  computed,
  contentChild,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { type FieldTree } from '@angular/forms/signals';
import { ErrorText } from './error-text';
import { FieldLabel } from './field-label';
import { FieldAction } from './field-action';
import { Hint } from './hint';
import { FIELD_ATTEMPT } from './field-attempt';

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
 * After the first submit, every error shows as it stands, while typing too:
 * the visitor is now fixing what was refused.
 *
 *   <app-field [field]="form.name" [label]="text.name">
 *     <input appInput class="w-full" [formField]="form.name" />
 *   </app-field>
 *
 * `group` draws a fieldset and legend instead, for a control made of several
 * inputs (a segmented choice, a radio list), which no one label can name.
 * An element marked `appFieldCaption` joins the caption after the mark; it
 * needs no import, so what it holds stays in the chunk of the page using it.
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
      } @else if (optional() && !required()) {
        <span class="font-normal text-ink-subtle">({{ optional() }})</span>
      }
      <!-- What else the caption says about the field, such as a lock. -->
      <ng-content select="[appFieldCaption]" />
    </ng-template>
    <ng-template #caption>
      <label [for]="controlId()" appFieldLabel>
        {{ label() }}
        <ng-container [ngTemplateOutlet]="mark" />
      </label>
    </ng-template>

    @if (group()) {
      <fieldset [attr.aria-describedby]="descriptionIds()">
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
      @if (action()) {
        <div class="flex items-baseline justify-between">
          <ng-container [ngTemplateOutlet]="caption" />
          <ng-content select="[appFieldAction]" />
        </div>
      } @else {
        <ng-container [ngTemplateOutlet]="caption" />
      }
      <ng-container [ngTemplateOutlet]="control" />
      <!-- With a shared line, that line draws them. -->
      @if (!sharedLine()) {
        @if (error(); as error) {
          <p appErrorText [id]="errorId()" class="mt-1">{{ error }}</p>
        } @else if (hint(); as hint) {
          <p appHint [id]="hintId()" class="mt-1">{{ hint }}</p>
        }
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
  /**
   * The word for "optional", said beside the caption of a field that is not
   * required, on a form where most are.
   */
  readonly optional = input<string>();
  /** Given where a test or a link has to find the control by it. */
  readonly controlId = input(`field-${nextId++}`);
  /** Ids of further lines that describe the control, such as a server's answer. */
  readonly describedBy = input<string>();
  /**
   * The id of a line outside the field that says its hint and error, for
   * fields that share one under their row. The field still decides when its
   * error is due; the line reads `error()` and draws it.
   */
  readonly sharedLine = input<string>();

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly attempt = inject(FIELD_ATTEMPT, { optional: true });
  /** Rule 3: left since its last edit. */
  protected readonly left = signal(false);
  protected readonly action = contentChild(FieldAction);

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
  readonly descriptionIds = computed(() => {
    const shared = this.sharedLine();
    const hint = !shared && this.hint() && (this.group() || !this.error());
    const ids = [
      hint && this.hintId(),
      !shared && this.error() && this.errorId(),
      shared,
      this.describedBy(),
    ];
    return ids.filter(Boolean).join(' ') || null;
  });

  protected leave(event: FocusEvent): void {
    // Moving between the parts of one control is not leaving it.
    if (!this.host.contains(event.relatedTarget as Node | null)) {
      this.left.set(true);
    }
  }
}
