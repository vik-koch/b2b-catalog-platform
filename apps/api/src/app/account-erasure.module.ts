import { Global, Module } from '@nestjs/common';
import { ACCOUNT_ERASURE_STEPS } from '../core/accounts/account-erasure';
import { AccountDestruction } from '../destruction/account-destruction';
import { DestructionModule } from '../destruction/destruction.module';
import { OrderErasure } from '../orders/order-erasure';
import { OrderErasureModule } from '../orders/order-erasure.module';

/**
 * The steps an account's erasure takes in the areas accounts may not import.
 * Listed here, at the root, so a step left out is a boot error rather than
 * personal data quietly left behind. Global, because the accounts core that
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
  ],
  exports: [ACCOUNT_ERASURE_STEPS],
})
export class AccountErasureModule {}
