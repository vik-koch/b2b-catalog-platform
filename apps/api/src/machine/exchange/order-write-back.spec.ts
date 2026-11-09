import { OrderReader } from '../../core/ordering/order-reader';
import { OrderWriter } from '../../core/ordering/order-writer';
import { Database } from '../../platform/db/database';
import { OrderWriteBack } from './order-write-back';

/**
 * The write-back with its collaborators stubbed. A stub lands where the method
 * now lives: reads, the writer, or the write-back itself.
 */
const READS = new Set(['row', 'customerThread']);
const WRITER = new Set([
  'appendRevision',
  'mailCustomer',
  'saysTheSame',
  'setPayment',
]);

function service() {
  return new OrderWriteBack(
    {} as Database,
    {} as OrderReader,
    {} as OrderWriter,
  );
}

function stub(instance: OrderWriteBack, stubs: Record<string, unknown>) {
  for (const [name, value] of Object.entries(stubs)) {
    const owner = READS.has(name)
      ? instance['reads']
      : WRITER.has(name)
        ? instance['writer']
        : instance;
    Object.assign(owner, { [name]: value });
  }
}

describe('OrderWriteBack.writeBack notification', () => {
  it.each([
    ['requested', 'approved', true, 'moved'],
    ['ready', 'approved', true, 'corrected'],
    ['approved', 'approved', true, 'changed'],
    ['requested', 'approved', false, 'moved'],
  ] as const)(
    'mails %s → %s with content change=%s as %s',
    async (from, to, changed, notice) => {
      const instance = service();
      const current = {
        id: 'order-1',
        reference: 'WEB-1',
        revisionNumber: 1,
        status: from,
        paymentMethod: 'cash',
        paymentState: 'awaiting',
      };
      const mailCustomer = vi.fn().mockResolvedValue(undefined);
      const appendRevision = vi.fn().mockResolvedValue(undefined);
      // Isolate storage/pricing; exercise the real writeBack branching and the
      // notification it chooses for a combined content/status revision.
      stub(instance, {
        row: vi
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValue({
            ...current,
            status: to,
            revisionNumber: 2,
          }),
        writtenBackLines: vi.fn().mockResolvedValue({ priced: {}, lines: [] }),
        rewrittenSnapshot: vi.fn().mockReturnValue({}),
        saysTheSame: vi.fn().mockResolvedValue(!changed),
        customerThread: vi.fn().mockResolvedValue({ number: 1 }),
        appendRevision,
        mailCustomer,
      });

      const result = await instance.writeBack(
        {
          reference: current.reference,
          basedOnRevision: 1,
          status: to,
          lines: [{ productSourceId: 'ERP-1', pieces: 20, priceMinor: 199 }],
          notify: true,
          showCustomer: true,
        },
        '1c',
      );

      expect(appendRevision).toHaveBeenCalledTimes(1);
      expect(appendRevision).toHaveBeenCalledWith(
        current,
        expect.objectContaining({
          kind: changed ? 'adjustment' : 'transition',
          status: to,
        }),
      );
      expect(mailCustomer).toHaveBeenCalledWith(current.reference, 1, notice);
      expect(result.status).toBe(to);
      expect(result.revisionNumber).toBe(2);
    },
  );
});

describe('OrderWriteBack.writeBack over a customer cancellation', () => {
  // The customer rang the shop and asked for the order after all. Only an
  // instruction that says it takes the cancellation back may move it, and
  // only one that tells them.
  it.each([
    [{ restoreCustomerCancellation: true }, 'requested', null],
    [{ restoreCustomerCancellation: true }, 'approved', null],
    [{}, 'approved', 'order-called-off'],
    [{ restoreCustomerCancellation: false }, 'approved', 'order-called-off'],
    [{ restoreCustomerCancellation: true }, undefined, 'order-called-off'],
    [{ restoreCustomerCancellation: true }, 'cancelled', 'order-called-off'],
    [
      { restoreCustomerCancellation: true, notify: false },
      'approved',
      'restore-not-announced',
    ],
    [
      { restoreCustomerCancellation: true, showCustomer: false },
      'approved',
      'restore-not-announced',
    ],
    [
      { restoreCustomerCancellation: true },
      'declined',
      'transition-not-allowed',
    ],
  ] as const)('%o to %s is refused with %s', async (flags, to, refusal) => {
    const instance = service();
    const current = {
      id: 'order-1',
      reference: 'WEB-1',
      revisionNumber: 2,
      status: 'cancelled',
      paymentMethod: 'cash',
      paymentState: 'not-due',
      // Written by the account that owns the order: the customer's own.
      revisionCreatedBy: 'customer-1',
      userId: 'customer-1',
    };
    const appendRevision = vi.fn().mockResolvedValue(undefined);
    const mailCustomer = vi.fn().mockResolvedValue(undefined);
    stub(instance, {
      row: vi
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValue({ ...current, status: to, revisionNumber: 3 }),
      customerThread: vi.fn().mockResolvedValue({ number: 1 }),
      appendRevision,
      mailCustomer,
    });

    const action = instance.writeBack(
      {
        reference: current.reference,
        basedOnRevision: 2,
        status: to,
        statusReason: to === 'declined' ? 'Out of stock.' : undefined,
        notify: true,
        showCustomer: true,
        ...flags,
      },
      '1c',
    );

    if (refusal) {
      await expect(action).rejects.toMatchObject({
        response: { code: refusal },
      });
      expect(appendRevision).not.toHaveBeenCalled();
      expect(mailCustomer).not.toHaveBeenCalled();
    } else {
      expect((await action).status).toBe(to);
      expect(appendRevision).toHaveBeenCalledWith(
        current,
        expect.objectContaining({ kind: 'transition', status: to }),
      );
      expect(mailCustomer).toHaveBeenCalledWith(current.reference, 1, 'moved');
    }
  });
});

describe('OrderWriteBack on an order whose personal details were removed', () => {
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

  function scrubbedService(row: Record<string, unknown> = scrubbed) {
    const instance = service();
    const appendRevision = vi.fn().mockResolvedValue(undefined);
    const mailCustomer = vi.fn().mockResolvedValue(undefined);
    const setPayment = vi.fn().mockResolvedValue(undefined);
    stub(instance, {
      row: vi.fn().mockResolvedValue(row),
      customerThread: vi.fn().mockResolvedValue({ number: 1 }),
      appendRevision,
      mailCustomer,
      setPayment,
    });
    return { instance, appendRevision, mailCustomer, setPayment };
  }

  const refused = { response: { code: 'personal-data-removed' } };

  it('refuses a write-back that takes a customer cancellation back', async () => {
    const { instance, appendRevision, mailCustomer } = scrubbedService();

    await expect(
      instance.writeBack(
        {
          reference: 'WEB-1',
          basedOnRevision: 4,
          status: 'requested',
          restoreCustomerCancellation: true,
          notify: true,
          showCustomer: true,
        },
        '1c',
      ),
    ).rejects.toMatchObject(refused);
    expect(appendRevision).not.toHaveBeenCalled();
    expect(mailCustomer).not.toHaveBeenCalled();
  });

  it('refuses a write-back that walks a completed order back', async () => {
    const { instance, appendRevision } = scrubbedService({
      ...scrubbed,
      status: 'completed',
      paymentState: 'paid',
      revisionCreatedBy: null,
    });

    await expect(
      instance.writeBack(
        {
          reference: 'WEB-1',
          basedOnRevision: 4,
          status: 'ready',
          notify: false,
          showCustomer: true,
        },
        '1c',
      ),
    ).rejects.toMatchObject(refused);
    expect(appendRevision).not.toHaveBeenCalled();
  });

  it('answers a write-back that says what the order says with unchanged', async () => {
    const { instance } = scrubbedService({
      ...scrubbed,
      status: 'completed',
      revisionCreatedBy: null,
    });

    const result = await instance.writeBack(
      {
        reference: 'WEB-1',
        basedOnRevision: 4,
        status: 'completed',
        notify: true,
        showCustomer: true,
      },
      '1c',
    );

    expect(result.kind).toBe('unchanged');
  });

  it('still records a payment written back for it', async () => {
    const { instance, setPayment } = scrubbedService({
      ...scrubbed,
      status: 'completed',
      paymentState: 'awaiting',
      revisionCreatedBy: null,
    });

    const result = await instance.writeBack(
      {
        reference: 'WEB-1',
        basedOnRevision: 4,
        paid: true,
        notify: false,
        showCustomer: true,
      },
      '1c',
    );

    expect(result.kind).toBe('payment');
    expect(setPayment).toHaveBeenCalledWith('WEB-1', true, null);
  });
});
