import { OrderDocumentsService } from '../../core/ordering/order-documents.service';
import { OrderNotifications } from '../../core/ordering/order-notifications';
import { OrderReader } from '../../core/ordering/order-reader';
import { OrderRules } from '../../core/ordering/order-rules';
import { OrderWriter } from '../../core/ordering/order-writer';
import { Database } from '../../platform/db/database';
import { StaffOrdersService } from './staff-orders.service';

describe('StaffOrdersService on an order whose personal details were removed', () => {
  // Finished for good (NFR-LEGAL-14): nobody to deliver to, and a mail would
  // go to the placeholder the removal left behind. Money may still be
  // recorded, and a source re-sending what the order says is still told so.
  const scrubbed = {
    id: 'order-1',
    reference: 'WEB-1',
    revisionNumber: 4,
    status: 'cancelled',
    paymentMethod: 'cash',
    paymentState: 'not-due',
    revisionCreatedBy: 'customer-1',
    userId: 'customer-1',
    personalDataRemovedAt: new Date('2026-10-01T00:00:00Z'),
  };

  // The real writer, so a move is refused where every move is checked.
  function scrubbedService(row: Record<string, unknown> = scrubbed) {
    const db = {} as Database;
    const reads = {
      row: vi.fn().mockResolvedValue(row),
      customerThread: vi.fn().mockResolvedValue({ number: 1 }),
    } as unknown as OrderReader;
    const writer = new OrderWriter(
      db,
      reads,
      {} as OrderNotifications,
      {} as OrderDocumentsService,
      { basis: 'included', rate: 19, statedAtPrices: true },
    );
    const appendRevision = vi.fn().mockResolvedValue(undefined);
    const mailCustomer = vi.fn().mockResolvedValue(undefined);
    Object.assign(writer, { appendRevision, mailCustomer });
    const instance = new StaffOrdersService(
      db,
      reads,
      writer,
      {} as OrderRules,
      {} as OrderDocumentsService,
      null,
    );
    return { instance, appendRevision, mailCustomer };
  }

  const refused = { response: { code: 'personal-data-removed' } };

  it('refuses a manager reopening it', async () => {
    const { instance, appendRevision } = scrubbedService();

    await expect(
      instance.transitionForStaff(
        'WEB-1',
        {
          to: 'requested',
          reason: null,
          notify: true,
          markPaid: false,
          showCustomer: true,
        },
        'manager-1',
      ),
    ).rejects.toMatchObject(refused);
    expect(appendRevision).not.toHaveBeenCalled();
  });

  it('refuses a manager adjusting it', async () => {
    const { instance, appendRevision } = scrubbedService();

    await expect(
      instance.adjust(
        'WEB-1',
        { basedOnRevision: 4 } as Parameters<typeof instance.adjust>[1],
        'manager-1',
      ),
    ).rejects.toMatchObject(refused);
    expect(appendRevision).not.toHaveBeenCalled();
  });

  it('refuses writing to its customer', async () => {
    const { instance, mailCustomer } = scrubbedService();

    await expect(
      instance.showCustomerCurrent('WEB-1', true),
    ).rejects.toMatchObject(refused);
    expect(mailCustomer).not.toHaveBeenCalled();
  });
});
