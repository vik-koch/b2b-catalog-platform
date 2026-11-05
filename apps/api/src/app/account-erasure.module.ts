import { Global, Module } from '@nestjs/common';
import { ACCOUNT_ERASURE_STEPS } from '../core/accounts/account-erasure';
import { OrderErasure } from '../core/ordering/order-erasure';
import { OrderErasureModule } from '../core/ordering/order-erasure.module';

/**
 * The steps an account's erasure takes in the areas accounts may not import.
 * Listed here, at the root, so a step left out is a boot error rather than
 * personal data quietly left behind. Global, because the accounts core that
 * runs them cannot import the root.
 */
@Global()
@Module({
  imports: [OrderErasureModule],
  providers: [
    {
      provide: ACCOUNT_ERASURE_STEPS,
      useFactory: (orders: OrderErasure) => [orders],
      inject: [OrderErasure],
    },
  ],
  exports: [ACCOUNT_ERASURE_STEPS],
})
export class AccountErasureModule {}
