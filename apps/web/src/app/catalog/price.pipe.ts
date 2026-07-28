import { inject, Pipe, PipeTransform } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { formatPriceMinor } from './price';

/**
 * `{{ product.priceMinor | price }}` → a localised currency string, using the
 * deployment's configured currency and locale. Pure: the config is fixed for
 * the app's lifetime, so results memoise on the input amount.
 */
@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  transform(priceMinor: number): string {
    return formatPriceMinor(priceMinor, this.currency);
  }
}
