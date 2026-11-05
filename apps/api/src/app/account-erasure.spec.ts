import { AccountErasure } from '../core/accounts/account-erasure';
import { Captured, renderingDb } from '../core/accounts/rendering-db.fixture';
import { UsersService } from '../core/accounts/users.service';
import { OrderDocumentFiles } from '../core/ordering/order-document-files';
import { OrderErasure } from '../core/ordering/order-erasure';

/**
 * Account deletion (FR-AUTH-06) across its areas, rendered, not run. "Past
 * orders are kept, with your details removed" is one UPDATE, and the columns
 * it forgets are the ones nobody notices, so this asserts the statement:
 * what is scrubbed, what is left, and that it is one transaction.
 */

describe('UsersService.anonymize', () => {
  const captured: Captured[] = [];
  const reads: Captured[] = [];
  const statement = (table: string) =>
    captured.find((entry) => entry.table === table) ?? { sql: '', params: [] };

  beforeAll(async () => {
    const service = new UsersService(
      renderingDb(captured, undefined, [], reads),
      new AccountErasure([new OrderErasure({} as OrderDocumentFiles)]),
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
      // Every version, not the current one: an old one holds the same name
      // and address.
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
      // A manager's words about this customer's order.
      'note',
      // What this customer was charged, as with `tierId`.
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

    // A delivery must keep street, postcode, city and country
    // (`order_revisions_fulfilment_destination`): overwritten where set, not
    // nulled.
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
    // Through this account's orders only, by their revisions, which lines
    // hang off.
    expect(sql).toContain(
      '"revisionId" in (select "id" from "order_revisions"',
    );
    expect(sql).toContain('"orders"."userId" = $');
  });
});
