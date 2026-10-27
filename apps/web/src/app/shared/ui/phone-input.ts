import { Component, inject, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DigitMask } from './digit-mask';
import { FieldBinding } from './field-binding';
import { FieldPrefix } from './field-prefix';
import { Input } from './input';

/**
 * The phone control inside a Field: the deployment's country code beside its
 * digit mask. A deployment with no `phoneInput` gets a plain text field, since
 * with no country code there is no national part to mask.
 *
 *   <app-field [field]="form.phone" [label]="text.phone">
 *     <app-phone-input [field]="form.phone" />
 *   </app-field>
 */
@Component({
  selector: 'app-phone-input',
  imports: [FormField, FieldBinding, DigitMask, FieldPrefix, Input],
  host: { class: 'block' },
  template: `
    @if (config; as phone) {
      <div class="flex">
        <span appFieldPrefix>{{ phone.countryCode }}</span>
        <input
          type="tel"
          appDigitMask
          [mask]="phone.mask ?? ''"
          [prefix]="phone.countryCode"
          [formField]="field()"
          [autocomplete]="autocomplete()"
          inputmode="tel"
          appInput
          [class]="inputWidth() + ' rounded-l-none'"
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
  /**
   * How wide the box is, where the column is wider than any number the mask
   * can hold. The country code stands beside it and is not counted.
   */
  readonly inputWidth = input('w-full');
  /** `off` where staff type a customer's number rather than their own. */
  readonly autocomplete = input('tel');

  protected readonly config = inject(DEPLOYMENT_CONFIG).phoneInput;
}
