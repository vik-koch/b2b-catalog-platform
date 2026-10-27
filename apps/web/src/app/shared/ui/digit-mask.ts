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
 * Formats a digit-only field as the visitor types, per a configurable mask
 * where `#` is one digit and every other character is a literal separator
 * (e.g. `(###) ###-####`). An empty mask means "digits only" — no grouping and
 * no length limit. Used by the phone fields and by the company registration
 * number (FR-AUTH-01), whose masks are both deployment config.
 *
 * The control value is the formatted, typed part only. Any fixed prefix — a
 * phone country code, a VAT country code — is owned and displayed by the form
 * and prepended when the value is submitted, never entered here. Tell the
 * directive what that prefix is (`[prefix]`) and a value arriving with one is
 * relieved of it: a browser autofilling a full international number would
 * otherwise have its country code masked as part of the national number, and
 * stored doubled.
 *
 * The mask may change under a live field — the company-id picker swaps one
 * jurisdiction's grouping for another's — so it is watched rather than read
 * once: what is on screen is regrouped immediately, and the control follows.
 * Without that the field keeps the old grouping until the next keystroke, and
 * a shorter new mask would truncate on screen only.
 *
 * A custom control for `[formField]`: it owns what the input shows, so the
 * field binds its `value` rather than the element's, and the native
 * `disabled`, `required` and `name` are said here. Deliberately simple: it
 * reformats on input and leaves the caret at the end, which is fine for a
 * short, append-mostly field — a mask library would only be worth it if we
 * needed mid-string editing.
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
  /** The fixed prefix the form shows beside this field, e.g. `+49`. Used only
   * to recognise and remove one that arrives inside the value. */
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
