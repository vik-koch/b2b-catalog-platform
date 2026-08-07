import {
  Directive,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { applyMask } from '@b2b-catalog-platform/shared';

/**
 * Formats a digit-only field as the visitor types, per a configurable mask
 * where `#` is one digit and every other character is a literal separator
 * (e.g. `(###) ###-####`). An empty mask means "digits only" — no grouping and
 * no length limit. Used by the phone fields and by the company registration
 * number (FR-AUTH-01), whose masks are both deployment config.
 *
 * The control value is the formatted, typed part only. Any fixed prefix — a
 * phone country code, a VAT country code — is owned and displayed by the form
 * and prepended when the value is submitted, never entered here.
 *
 * Implemented as a ControlValueAccessor so it drops into reactive forms via
 * `formControlName`. Deliberately simple: it reformats on input and leaves the
 * caret at the end, which is fine for a short, append-mostly field — a mask
 * library would only be worth it if we needed mid-string editing.
 */
@Directive({
  selector: 'input[appDigitMask]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DigitMask),
      multi: true,
    },
  ],
})
export class DigitMask implements ControlValueAccessor {
  readonly mask = input('');

  private readonly el =
    inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  @HostListener('input')
  handleInput(): void {
    const formatted = this.format(this.el.value);
    this.el.value = formatted;
    this.onChange(formatted);
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.el.value = this.format(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.disabled = isDisabled;
  }

  private format(value: string): string {
    return applyMask(value, this.mask());
  }
}
