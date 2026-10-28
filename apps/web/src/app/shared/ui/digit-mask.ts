import {
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  untracked,
} from '@angular/core';
import { type FormValueControl } from '@angular/forms/signals';
import { applyMask, stripDialPrefix } from '@b2b-catalog-platform/shared';

/**
 * Formats a digit-only field as it is typed, per a mask where `#` is a digit
 * and anything else a separator (`(###) ###-####`); an empty mask is digits
 * only. The value is the typed part: a fixed prefix such as a country code is
 * the form's, and one arriving inside the value (a browser autofilling a full
 * international number) is taken off, or it would be stored twice.
 *
 * The mask may change under a live field, so it is watched: what is on screen
 * regroups at once, and the value follows. A custom control for `[formField]`,
 * so `disabled`, `required` and `name` are said here. It reformats on input
 * and leaves the caret at the end, which suits a short, append-mostly field.
 */
@Directive({
  selector: 'input[appDigitMask]',
  host: {
    '(input)': 'handleInput()',
    '(blur)': 'touch.emit()',
    '[disabled]': 'disabled()',
    '[required]': 'required()',
    '[attr.name]': 'name() || null',
  },
})
export class DigitMask implements FormValueControl<string> {
  readonly mask = input('');
  /** The prefix the form shows beside this field, to remove from a value. */
  readonly prefix = input('');

  readonly value = model('');
  readonly disabled = input(false);
  readonly required = input(false);
  readonly name = input('');
  readonly touch = output<void>();

  private readonly el =
    inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  /**
   * The last value this field was given, before any mask was applied to it —
   * what the form wrote, or what was typed. The screen is not that source: a
   * mask can only ever remove digits, so re-reading the input to re-format it
   * would keep whatever the previous mask had already dropped.
   */
  private source = '';
  /** What this field last wrote itself, so its own write is not read back
   * as one from the form. */
  private written: string | null = null;
  private lastMask: string | null = null;

  constructor() {
    // One effect for both: a form that sets the value and the format together
    // (a whole address, country and postal code) delivers them in one pass,
    // and two effects would each find the other's half already on screen.
    effect(() => {
      const value = this.value();
      const mask = this.mask();
      untracked(() => {
        if (value !== this.written) {
          // The form has moved past what was typed: a later write of that
          // same value is the form's again, and has to be painted.
          this.written = null;
          this.source = this.stripPrefix(value);
        }
        const formatted = applyMask(this.source, mask);
        if (formatted !== this.el.value) this.el.value = formatted;
        const maskChanged = this.lastMask !== null && mask !== this.lastMask;
        this.lastMask = mask;
        // A value from the form is left as it is under the mask it came with.
        // A changed mask pushes what it shows: one that takes fewer digits
        // drops some, and a value the visitor can no longer see must not
        // still be saved.
        if (maskChanged && formatted !== value) this.write(formatted);
      });
    });
  }

  protected handleInput(): void {
    // Autofill arrives as an `input` event like any other typing, so the
    // prefix is taken off here as well as for a value from the form.
    this.source = this.stripPrefix(this.el.value);
    const formatted = this.format(this.source);
    this.el.value = formatted;
    this.write(formatted);
  }

  private write(value: string): void {
    this.written = value;
    this.value.set(value);
  }

  private format(value: string): string {
    return applyMask(value, this.mask());
  }

  private stripPrefix(value: string): string {
    const prefix = this.prefix();
    return prefix ? stripDialPrefix(value, prefix) : value;
  }
}
