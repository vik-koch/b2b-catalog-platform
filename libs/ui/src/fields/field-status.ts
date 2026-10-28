import {
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';
import { FIELD_ATTEMPT } from './field-attempt';

/**
 * When a field's error is due, the same in every form, for Field and
 * FieldGroup alike:
 *
 * 1. A valid field never shows one.
 * 2. A missing required value waits for the first submit: tabbing through a
 *    form to see what it asks is not a mistake.
 * 3. Any other error shows once the field is left and hides on the next edit:
 *    "j" is an unfinished address, not a wrong one.
 *
 * After the first submit every error shows as it stands, while typing too.
 */
@Directive({
  host: {
    '(focusout)': 'leave($event)',
    // A select or a checkbox fires change, never input.
    '(input)': 'left.set(false)',
    '(change)': 'left.set(false)',
  },
})
export class FieldStatus<T> {
  readonly field = input.required<FieldTree<T>>();

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly attempt = inject(FIELD_ATTEMPT, { optional: true });
  /** Rule 3: left since its last edit. */
  protected readonly left = signal(false);

  readonly required = computed(() => this.field()().required());

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

  protected leave(event: FocusEvent): void {
    // Moving between the parts of one control is not leaving it.
    if (!this.host.contains(event.relatedTarget as Node | null)) {
      this.left.set(true);
    }
  }
}
