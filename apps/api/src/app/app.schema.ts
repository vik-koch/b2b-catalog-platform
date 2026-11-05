// The whole database for drizzle-kit, composed of each area's tables. The
// app's queries import tables from their area and never need it.
export * from '../platform/db/schema';
export * from '../core/catalog/catalog-schema';
export * from '../core/site/site-schema';
export * from '../core/accounts/accounts-schema';
export * from '../core/ordering/ordering-schema';
export * from '../core/exchange/exchange-schema';
