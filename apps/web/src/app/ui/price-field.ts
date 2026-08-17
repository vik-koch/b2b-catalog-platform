import { Directive, inject } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { isPartialPrice } from '../catalog/price';
import { refuseUnless } from './refuse-input';

/**
 * Keeps a price field to what a price can look like.
 *
 * `type="number"` cannot be used here: a browser reports a half-typed "18." as
 * an *empty* value, so a bound signal wipes the field the moment the decimal
 * separator is pressed. A plain text input fixes that and gives up the
 * restriction, which this puts back — and puts back better, since it also
 * enforces the deployment currency's precision and accepts either separator.
 */
@Directive({
  selector: 'input[appPriceField]',
  host: { '(beforeinput)': 'onBeforeInput($event)' },
})
export class PriceField {
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  protected onBeforeInput(event: InputEvent): void {
    refuseUnless(event, (next) => isPartialPrice(next, this.currency));
  }
}
