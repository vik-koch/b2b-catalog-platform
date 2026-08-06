import { signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormGroup,
  TouchedChangeEvent,
  ValueChangeEvent,
} from '@angular/forms';

/**
 * When a field's error message is *shown* — a separate question from whether
 * the field is valid, and the difference between a form that helps and one
 * that scolds.
 *
 * Three rules:
 *
 * 1. A valid field never shows an error.
 * 2. A **missing required value** waits for the submit. Tabbing through a form
 *    to see what it asks for is not a mistake, and five red fields for a form
 *    nobody has filled in yet only teaches people to ignore red.
 * 3. Every other error — a malformed address, an incomplete number — is
 *    revealed when the field is **left**, and hidden again the moment the
 *    visitor goes back to typing in it. "j" is not a wrong address, it is an
 *    unfinished one, and that is just as true the second time around: someone
 *    who clears the field and starts over is composing, not erring, and must
 *    not be corrected mid-word because they were corrected once before.
 *
 * Rule 3 is why this is a class rather than a predicate. Angular's `touched`
 * latches on the first blur and never clears, so it can say "has been left at
 * least once" but not "is being worked on right now". Revealing on the
 * `TouchedChangeEvent` and concealing on the next `ValueChangeEvent` tracks
 * that, and un-touching the control on the way keeps the next blur meaningful.
 *
 * Must be constructed in an injection context (a component field initializer),
 * because it unsubscribes with `takeUntilDestroyed`.
 */
export class FieldErrors {
  private readonly revealed = signal<ReadonlySet<AbstractControl>>(new Set());

  /** True once the form has been sent for validation at least once. */
  private readonly submitted = signal(false);

  constructor(private readonly form: FormGroup) {
    for (const control of Object.values(form.controls)) {
      control.events.pipe(takeUntilDestroyed()).subscribe((event) => {
        if (event instanceof TouchedChangeEvent && event.touched) {
          this.update((revealed) => revealed.add(control));
        } else if (event instanceof ValueChangeEvent) {
          this.conceal(control);
        }
      });
    }
  }

  /**
   * Call from the submit handler, before checking validity: from here on every
   * problem is shown, including the fields the visitor never visited.
   */
  markSubmitted(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
  }

  /** Whether this control's error message belongs on screen right now. */
  show(control: AbstractControl): boolean {
    if (control.valid) return false;
    if (this.submitted()) return true;
    if (control.hasError('required')) return false;
    return this.revealed().has(control);
  }

  /**
   * A group-level error (e.g. two password fields that disagree) belongs to no
   * single field, so it follows whichever field the visitor is looking at.
   */
  showGroupError(error: string, control: AbstractControl): boolean {
    if (!this.form.hasError(error)) return false;
    return this.submitted() || this.revealed().has(control);
  }

  private conceal(control: AbstractControl): void {
    if (!this.revealed().has(control)) return;
    this.update((revealed) => revealed.delete(control));
    // `touched` latches, so the next blur would emit nothing and the message
    // could never come back. Clearing it keeps blur → reveal working for the
    // whole life of the form.
    control.markAsUntouched({ emitEvent: false });
  }

  private update(mutate: (revealed: Set<AbstractControl>) => void): void {
    const next = new Set(this.revealed());
    mutate(next);
    this.revealed.set(next);
  }
}
