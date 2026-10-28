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
import { DIGIT_MASK_FORMAT } from './digit-mask-format';

/**
 * Groups a digit field as it is typed, by DIGIT_MASK_FORMAT. The value is the
 * typed part: a `prefix` arriving inside it (autofill) is taken off, or it is
 * stored twice. A changed mask regroups at once and the value follows. A
 * custom control for `[formField]`, so `disabled`, `required` and `name` are
 * said here. The caret ends up at the end: fine for a short, append-mostly
 * field.
 */
@Directive({
  selector: 'input[uiDigitMask]',
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

  private readonly rule = inject(DIGIT_MASK_FORMAT);
  private readonly el =
    inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  /** The last value given, unmasked. Never the screen: a mask only drops
   * digits, so re-reading it keeps what the previous mask dropped. */
  private source = '';
  /** What this field last wrote itself, so its own write is not read back
   * as one from the form. */
  private written: string | null = null;
  private lastMask: string | null = null;

  constructor() {
    // One effect for both: a form setting value and mask together delivers
    // them in one pass, and two effects would each see half on screen.
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
        const formatted = this.rule.apply(this.source, mask);
        if (formatted !== this.el.value) this.el.value = formatted;
        const maskChanged = this.lastMask !== null && mask !== this.lastMask;
        this.lastMask = mask;
        // A form's value stays as given; a changed mask pushes what it shows,
        // since digits it dropped must not still be saved.
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
    return this.rule.apply(value, this.mask());
  }

  private stripPrefix(value: string): string {
    const prefix = this.prefix();
    return prefix ? this.rule.stripPrefix(value, prefix) : value;
  }
}
