import { TestBed } from '@angular/core/testing';
import {
  AdminOrderDetail,
  AdminOrderDocument,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { OrderDocumentsPanel } from './order-documents-panel';
import { AdminOrdersService } from './orders.service';

const text = defaultAdminText.orderDetail.documents;

const generated: AdminOrderDocument = {
  kind: 'order-summary',
  source: 'generated',
  fileName: 'DEMO-260826-4831.pdf',
  contentType: 'application/pdf',
  byteSize: null,
  suppliedAt: null,
  suppliedForRevision: null,
  outdated: false,
  notifiedAt: null,
};

const order = (overrides: Partial<AdminOrderDetail> = {}) =>
  ({
    reference: 'DEMO-260826-4831',
    revisionNumber: 3,
    customerRevisionNumber: 3,
    paymentMethod: 'bank-transfer',
    paymentState: 'awaiting',
    documents: [generated],
    ...overrides,
  }) as AdminOrderDetail;

async function render(
  detail: AdminOrderDetail,
  api: Partial<AdminOrdersService> = {},
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderDocumentsPanel],
    providers: [
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: ConfirmService, useValue: { ask: vi.fn(async () => true) } },
      {
        provide: AdminOrdersService,
        useValue: {
          supplyDocument: vi.fn(async () => generated),
          removeDocument: vi.fn(async () => undefined),
          notifyAboutDocument: vi.fn(async () => undefined),
          ...api,
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(OrderDocumentsPanel);
  fixture.componentRef.setInput('order', detail);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** The name of each document listed — the first line of each row, whatever
 * the row's markup does around it. */
const rowLabels = (el: HTMLElement) =>
  [...el.querySelectorAll('li')].map((row) =>
    row.querySelector('span > span')?.textContent?.trim(),
  );

describe('OrderDocumentsPanel', () => {
  /**
   * Two rows on an invoiced order: the summary, which always exists, and the
   * payment details, which only the shop can give.
   */
  it('offers both documents on an invoiced order', async () => {
    const { el } = await render(order());

    expect(rowLabels(el)).toEqual([text.paymentInstructions, text.summary]);
  });

  /**
   * Absent rather than disabled on a cash order: the document cannot exist,
   * and a control that can never be pressed states nothing.
   */
  it('drops the payment row where nothing is invoiced', async () => {
    const { el } = await render(order({ paymentMethod: 'cash' }));

    expect(rowLabels(el)).toEqual([text.summary]);
  });

  /** One document per kind: a supplied file replaces the generated summary
   * rather than sitting beside it. */
  it('shows a supplied summary in place of the generated one', async () => {
    const { el } = await render(
      order({
        documents: [
          {
            ...generated,
            source: 'supplied',
            fileName: 'invoice.pdf',
            byteSize: 24_000,
            suppliedAt: '2026-08-27T10:00:00.000Z',
            suppliedForRevision: 3,
          },
        ],
      }),
    );

    expect(rowLabels(el)).toContain(text.summary);
    expect(el.textContent).toContain('PDF');
    // A supplied file can be taken back; a generated one cannot.
    expect(el.textContent).toContain(text.remove);
  });

  it('has nothing to remove where nothing was supplied', async () => {
    const { el } = await render(order());

    expect(el.textContent).not.toContain(text.remove);
  });

  /**
   * Nothing checks a supplied file against the order, so a version written
   * after it arrived is the only warning there is that it quotes an older
   * total.
   */
  it('warns where a supplied file is behind the order', async () => {
    const { el } = await render(
      order({
        documents: [
          {
            ...generated,
            kind: 'payment-instructions',
            source: 'supplied',
            byteSize: 1000,
            suppliedAt: '2026-08-27T10:00:00.000Z',
            suppliedForRevision: 1,
            outdated: true,
          },
          generated,
        ],
      }),
    );

    expect(el.textContent).toContain('1');
    expect(el.querySelector('.text-amber-700')).not.toBeNull();
  });

  /**
   * Telling the customer is its own button, on a supplied document only — a
   * generated summary is what their page already shows, and there is nothing
   * to announce.
   */
  it('offers to send a supplied document, and nothing to send otherwise', async () => {
    const generatedOnly = await render(order());
    expect(generatedOnly.el.textContent).not.toContain(text.notify);

    const { el } = await render(
      order({
        documents: [
          {
            ...generated,
            kind: 'payment-instructions',
            source: 'supplied',
            byteSize: 1000,
            suppliedAt: '2026-08-27T10:00:00.000Z',
            suppliedForRevision: 3,
          },
          generated,
        ],
      }),
    );
    expect(el.textContent).toContain(text.notify);
  });

  /** Read off the row, not remembered by the screen: whether the shop has
   * sent somebody their payment details has to survive a reload. */
  it('says so where the customer has already been written to', async () => {
    const { el } = await render(
      order({
        documents: [
          {
            ...generated,
            kind: 'payment-instructions',
            source: 'supplied',
            byteSize: 1000,
            suppliedAt: '2026-08-27T10:00:00.000Z',
            suppliedForRevision: 3,
            notifiedAt: '2026-08-27T10:05:00.000Z',
          },
          generated,
        ],
      }),
    );

    // Still pressable: a customer who lost the message is asking for the same
    // document again.
    expect(el.textContent).toContain(text.notifySent);
    expect(el.textContent).not.toContain(text.notifyBehind);
  });

  /**
   * Withheld while the customer's own page is behind the version the file
   * belongs to: the message would announce a document they cannot open.
   */
  it('does not offer to send what the customer cannot yet see', async () => {
    const { el } = await render(
      order({
        customerRevisionNumber: 1,
        documents: [
          {
            ...generated,
            kind: 'payment-instructions',
            source: 'supplied',
            byteSize: 1000,
            suppliedAt: '2026-08-27T10:00:00.000Z',
            suppliedForRevision: 3,
          },
          generated,
        ],
      }),
    );

    expect(el.textContent).not.toContain(text.notify);
    expect(el.textContent).toContain(text.notifyBehind);
  });
});
