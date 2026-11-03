import { AccountErasure } from '../core/accounts/account-erasure';
import { Captured, renderingDb } from '../core/accounts/rendering-db.fixture';
import { UsersService } from '../core/accounts/users.service';
import { AccountDestruction } from '../destruction/account-destruction';
import { OrderDocumentFiles } from '../orders/order-document-files';
import { OrderErasure } from '../orders/order-erasure';

/**
 * Account deletion (FR-AUTH-06) across the areas it reaches, rendered rather
 * than executed.
 *
 * The promise the app already makes — "past orders are kept for our
 * bookkeeping, with your details removed from them" — is one UPDATE, and the
 * columns it forgets are exactly the ones nobody notices. So this asserts the
 * statement itself: which columns are scrubbed, which are deliberately left
 * alone, and that the whole thing happens inside the one transaction.
 */

describe('UsersService.anonymize', () => {
  const captured: Captured[] = [];
  const reads: Captured[] = [];
  const statement = (table: string) =>
    captured.find((entry) => entry.table === table) ?? { sql: '', params: [] };

  beforeAll(async () => {
    const service = new UsersService(
      renderingDb(captured, undefined, [], reads),
      new AccountErasure([
        new OrderErasure({} as OrderDocumentFiles),
        new AccountDestruction(),
      ]),
    );
    await service.anonymize('user-1', 'unusable-hash', { reason: 'request' });
  });

  it('does the whole thing in one transaction', () => {
    // Eight statements, one callback: an account that is half-anonymized is
    // worse than one that is not, and one deleted without its record cannot
    // be proved deleted.
    expect(captured.map((entry) => entry.table)).toEqual([
      'addresses',
      // A code the account was waiting on carries a number (FR-AUTH-12).
      'sign_in_codes',
      // The account consent ends with the account (NFR-LEGAL-09).
      'consent_withdrawals',
      'order_items',
      // Every version of every order, not the current one alone: a superseded
      // revision holds the same name and the same address (ADR 0051).
      'order_revisions',
      // The orders themselves are touched only to say they changed.
      'orders',
      // The record that it happened (NFR-LEGAL-12).
      'destruction_records',
      'users',
    ]);
  });

  it('records the destruction under the account id, by the holder', () => {
    const { sql, params } = statement('destruction_records');

    expect(sql).toContain('insert into "destruction_records"');
    // No address anywhere: the holder's is what went.
    expect(params).toEqual([
      'account',
      'user-1',
      // As drizzle hands a varchar[] to the driver.
      '{"account-details","addresses","order-details","order-documents"}',
      'request',
      'user-1',
      null,
    ]);
  });

  it("ends the account's consents as deleted, leaving any already ended", () => {
    const { sql, params } = statement('consent_withdrawals');

    expect(sql).toContain('insert into "consent_withdrawals"');
    // No admin named: the holder deleted it themselves.
    expect(params).toEqual(['consent-1', 'account-deleted', null, null]);
    const [open] = reads;
    expect(open.sql).toContain(
      'where ("consents"."userId" = $1 and "consent_withdrawals"."id" is null)',
    );
    expect(open.params).toEqual(['user-1']);
  });

  it('marks the scrubbed orders as changed', () => {
    // How a system that pulled these orders before the account was closed
    // finds out the name and address it holds are gone (FR-ADM-08,
    // NFR-LEGAL-07): the outbound read pages by this column, so an order
    // nobody stamped never comes round again.
    const { sql } = statement('orders');

    expect(sql).toContain('"updatedAt"');
    expect(sql).not.toContain('"status"');
  });

  it('stamps when their details went, keeping an earlier removal', () => {
    // The retention sweep skips what is stamped (NFR-LEGAL-14), so an order
    // it cleared last year keeps that date when its account is deleted.
    const { sql } = statement('orders');

    expect(sql).toContain(
      '"personalDataRemovedAt" = coalesce("orders"."personalDataRemovedAt", $',
    );
  });

  it('empties every free-text column an order can name someone in', () => {
    const { sql } = statement('order_revisions');

    for (const column of [
      'contactName',
      'contactEmail',
      'contactPhone',
      'partyName',
      'partyRegistrationId',
      'billingStreet',
      'billingStreet2',
      'billingPostalCode',
      'billingCity',
      'billingRegion',
      'deliveryStreet',
      'deliveryStreet2',
      'deliveryPostalCode',
      'deliveryCity',
      'deliveryRegion',
      'preferredDate',
      'customerNote',
      // A manager's account of an adjustment — their words, about this
      // customer's order.
      'note',
      // What this customer was charged — the same argument that nulls tierId.
      'tierKey',
    ]) {
      expect(sql).toContain(`"${column}"`);
    }
  });

  it('leaves the bookkeeping record intact', () => {
    const { sql } = statement('order_revisions');

    // The order, its number and its money are why it is kept at all.
    expect(sql).not.toContain('"totalMinor"');
    expect(sql).not.toContain('"reference"');
    expect(sql).not.toContain('"createdAt"');
    // And it touches this account's orders only.
    expect(sql).toContain('"orders"."userId" = $');
  });

  it('keeps a delivery order’s destination non-null, as its constraint demands', () => {
    const { sql } = statement('order_revisions');

    // `orders_fulfilment_destination` requires a delivery order to keep street,
    // postcode, city and country — so those are overwritten where they are set
    // and left null where they are not, rather than nulled outright.
    expect(sql).toContain(
      'case when "order_revisions"."deliveryStreet" is null then null else $',
    );
    expect(sql).toContain(
      'case when "order_revisions"."deliveryCity" is null then null else $',
    );
  });

  it('scrubs the customer-typed line notes, scoped to this account', () => {
    const { sql, params } = statement('order_items');

    expect(sql).toContain('set "note" = $1');
    expect(params[0]).toBeNull();
    // Scoped through this account's own orders, never all of them — by way of
    // their revisions, which is what a line hangs off.
    expect(sql).toContain(
      '"revisionId" in (select "id" from "order_revisions"',
    );
    expect(sql).toContain('"orders"."userId" = $');
  });
});
