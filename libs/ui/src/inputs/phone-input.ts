import { Component, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { DigitMask } from './digit-mask';
import { FieldBinding } from '../fields/field-binding';
import { InputPrefix } from './input-prefix';
import { Input } from './input';

export interface PhoneMask {
  readonly countryCode: string;
  readonly mask?: string;
}

/**
 * The phone control inside a Field: a country code beside a digit mask. With
 * no `phone` it is a plain text field: no code, no national part to mask.
 *
 *   <app-field [field]="form.phone" [label]="text.phone">
 *     <app-phone-input [field]="form.phone" [phone]="phoneInput" />
 *   </app-field>
 */
@Component({
  selector: 'app-phone-input',
  imports: [FormField, FieldBinding, DigitMask, InputPrefix, Input],
  host: { class: 'block' },
  template: `
    @if (phone(); as phone) {
      <div class="flex">
        <span appInputPrefix>{{ phone.countryCode }}</span>
        <input
          type="tel"
          appDigitMask
          [mask]="phone.mask ?? ''"
          [prefix]="phone.countryCode"
          [formField]="field()"
          [autocomplete]="autocomplete()"
          inputmode="tel"
          appInput
          class="rounded-l-none"
          [class]="inputWidth()"
        />
      </div>
    } @else {
      <input
        type="tel"
        [formField]="field()"
        [autocomplete]="autocomplete()"
        appInput
        [class]="inputWidth()"
      />
    }
  `,
})
export class PhoneInput {
  readonly field = input.required<FieldTree<string>>();
  readonly phone = input<PhoneMask>();
  /**
   * How wide the box is, where the column is wider than any number the mask
   * can hold. The country code stands beside it and is not counted.
   */
  readonly inputWidth = input('w-full');
  /** `off` where staff type a customer's number rather than their own. */
  readonly autocomplete = input('tel');
}
