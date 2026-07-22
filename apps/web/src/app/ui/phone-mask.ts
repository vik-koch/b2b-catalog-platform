import {
  Directive,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Formats a phone input as the visitor types, per a configurable mask where
 * `#` is one digit and every other character is a literal separator (e.g.
 * `(###) ###-####`). An empty mask means "digits only" — no grouping and no
 * length limit. The control value is the formatted national part; the country
 * code is a fixed prefix owned by the form, not entered here.
 *
 * Implemented as a ControlValueAccessor so it drops into reactive forms via
 * `formControlName`. Deliberately simple: it reformats on input and leaves the
 * caret at the end, which is fine for a short, append-mostly field — a mask
 * library would only be worth it if we needed mid-string editing.
 */
@Directive({
  selector: 'input[appPhoneMask]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PhoneMask),
      multi: true,
    },
  ],
})
export class PhoneMask implements ControlValueAccessor {
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
    const mask = this.mask();
    const digits = value.replace(/\D/g, '');
    if (!mask) {
      return digits;
    }

    const maxDigits = (mask.match(/#/g) ?? []).length;
    const capped = digits.slice(0, maxDigits);

    let out = '';
    let next = 0;
    for (const ch of mask) {
      if (next >= capped.length) break;
      out += ch === '#' ? capped[next++] : ch;
    }
    return out;
  }
}
