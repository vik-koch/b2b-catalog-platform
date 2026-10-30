import { inject, Pipe, PipeTransform } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { formatPriceMinor } from './price';
import { moneyFormat } from '@b2b-catalog-platform/shared';

/**
 * `{{ product.priceMinor | price }}` → a localised currency string, using the
 * deployment's configured currency and locale. Pure: the config is fixed for
 * the app's lifetime, so results memoise on the input amount.
 */
@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));

  transform(priceMinor: number): string {
    return formatPriceMinor(priceMinor, this.currency);
  }
}
