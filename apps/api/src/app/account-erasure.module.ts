import { Global, Module } from '@nestjs/common';
import { ACCOUNT_ERASURE_STEPS } from '../core/accounts/account-erasure';
import { ACCOUNT_ORDERS } from '../core/accounts/account-orders';
import { AccountDestruction } from '../destruction/account-destruction';
import { DestructionModule } from '../destruction/destruction.module';
import { OrderCounts } from '../core/ordering/order-counts';
import { OrderErasure } from '../core/ordering/order-erasure';
import { OrderErasureModule } from '../core/ordering/order-erasure.module';

/**
 * What accounts need from the areas it may not import: the steps an
 * account's erasure takes, and the order counts. Listed here, at the root, so
 * a step left out is a boot error rather than personal data quietly left
 * behind. Global, because the accounts core that
 * runs them cannot import the root.
 */
@Global()
@Module({
  imports: [OrderErasureModule, DestructionModule],
  providers: [
    {
      provide: ACCOUNT_ERASURE_STEPS,
      // The orders are scrubbed before the record says they were.
      useFactory: (orders: OrderErasure, record: AccountDestruction) => [
        orders,
        record,
      ],
      inject: [OrderErasure, AccountDestruction],
    },
    { provide: ACCOUNT_ORDERS, useExisting: OrderCounts },
  ],
  exports: [ACCOUNT_ERASURE_STEPS, ACCOUNT_ORDERS],
})
export class AccountErasureModule {}
