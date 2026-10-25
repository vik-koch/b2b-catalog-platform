import {
  Directive,
  effect,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
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
  /** The fixed prefix the form shows beside this field, e.g. `+49`. Used only
   * to recognise and remove one that arrives inside the value. */
  readonly prefix = input('');

  private readonly el =
    inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  /**
   * The last value this field was given, before any mask was applied to it —
   * what the form wrote, or what was typed. The screen is not that source: a
   * mask can only ever remove digits, so re-reading the input to re-format it
   * would keep whatever the previous mask had already dropped.
   */
  private source = '';

  constructor() {
    // Reads the mask, so it re-runs whenever the chosen format changes.
    effect(() => {
      const formatted = applyMask(this.source, this.mask());
      if (formatted === this.el.value) return;
      this.el.value = formatted;
      // Pushed, not just painted: a mask that takes fewer digits drops some,
      // and a value the visitor can no longer see must not still be saved.
      this.onChange(formatted);
    });
  }

  @HostListener('input')
  handleInput(): void {
    // Autofill arrives as an `input` event like any other typing, so the
    // prefix is taken off here as well as in `writeValue`.
    this.source = this.stripPrefix(this.el.value);
    const formatted = this.format(this.source);
    this.el.value = formatted;
    this.onChange(formatted);
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.source = this.stripPrefix(value ?? '');
    // Formatted with whatever mask is bound *now*. A form that sets the format
    // and the value together sets the value first as far as this directive is
    // concerned — the new mask arrives with the next change detection — and the
    // effect above re-formats from `source` when it does.
    this.el.value = this.format(this.source);
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

  private stripPrefix(value: string): string {
    const prefix = this.prefix();
    return prefix ? stripDialPrefix(value, prefix) : value;
  }
}
