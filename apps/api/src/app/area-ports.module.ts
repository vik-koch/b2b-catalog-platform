import { Global, Module } from '@nestjs/common';
import { ACTOR_EMAILS } from '../platform/actor-emails';
import { ACCOUNT_ORDERS } from '../core/accounts/account-orders';
import { MACHINE_TOKENS } from '../platform/auth/machine-tokens';
import { SESSION_USERS } from '../platform/auth/session-users';
import { SITEMAP_PAGES } from '../platform/sitemap-pages';
import { PRODUCT_ORDERS } from '../core/catalog/product-orders';
import { TIER_ACCOUNTS } from '../core/catalog/tier-accounts';
import { AccountEmails } from '../core/accounts/account-emails';
import { SessionAccounts } from '../core/accounts/session-accounts';
import { TierAccountCounts } from '../core/accounts/tier-account-counts';
import { PageSitemap } from '../core/site/page-sitemap';
import { OrderCounts } from '../core/ordering/order-counts';
import { ProductOrderLines } from '../core/ordering/product-order-lines';
import { ApiTokenLookup } from '../core/exchange/api-token-lookup';

/**
 * What platform and an area ask of an area they may not import, answered by
 * that area and bound here. Global, because the askers cannot import the
 * root.
 */
@Global()
@Module({
  providers: [
    { provide: SESSION_USERS, useClass: SessionAccounts },
    { provide: MACHINE_TOKENS, useClass: ApiTokenLookup },
    { provide: ACTOR_EMAILS, useClass: AccountEmails },
    { provide: SITEMAP_PAGES, useClass: PageSitemap },
    { provide: PRODUCT_ORDERS, useClass: ProductOrderLines },
    { provide: TIER_ACCOUNTS, useClass: TierAccountCounts },
    { provide: ACCOUNT_ORDERS, useClass: OrderCounts },
  ],
  exports: [
    SESSION_USERS,
    MACHINE_TOKENS,
    ACTOR_EMAILS,
    SITEMAP_PAGES,
    PRODUCT_ORDERS,
    TIER_ACCOUNTS,
    ACCOUNT_ORDERS,
  ],
})
export class AreaPortsModule {}
