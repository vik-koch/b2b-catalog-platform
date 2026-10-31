import { inject, Pipe, PipeTransform } from '@angular/core';
import { formatMoneyMinor, moneyFormat } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';

/** `{{ product.priceMinor | price }}`, in the deployment's currency. Pure: the
 * config is fixed for the app's lifetime. */
@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));

  transform(priceMinor: number): string {
    return formatMoneyMinor(priceMinor, this.currency);
  }
}
