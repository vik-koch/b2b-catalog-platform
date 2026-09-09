import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderRevision } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { AdminOrderRevisionPage } from './order-revision-page';
import { AdminOrdersService } from './orders.service';

const text = defaultAdminText.orderDetail;

const address = {
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE' as const,
};

const version: OrderRevision = {
  reference: 'DEMO-260826-4831',
  documents: [
    {
      kind: 'order-summary',
      source: 'generated',
      fileName: 'DEMO-260826-4831.pdf',
      contentType: 'application/pdf',
      byteSize: null,
      suppliedAt: null,
      suppliedForRevision: null,
      outdated: false,
      notifiedAt: null,
    },
  ],
  status: 'approved',
  paymentState: 'awaiting',
  statusReason: null,
  changes: ['One more box, as agreed.'],
  revisionNumber: 2,
  customerRevisionNumber: 3,
  notifiedRevisionNumber: 3,
  notifiedStatuses: ['approved'],
  note: 'One more box, as agreed.',
  paidAt: null,
  createdAt: '2026-08-26T09:15:00.000Z',
  statusChangedAt: '2026-08-27T10:00:00.000Z',
  revisionCreatedAt: '2026-08-27T10:00:00.000Z',
  notifiedAt: '2026-08-27T10:01:00.000Z',
  author: 'manager@example.com',
  kind: 'adjustment',
  customerView: false,
  totalMinor: 39980,
  currency: 'EUR',
  itemCount: 1,
  contact: {
    name: 'Alex Fischer',
    email: 'alex@example.com',
    phone: '+494012345678',
  },
  party: { name: 'Kontor GmbH', registrationId: 'DE123456789' },
  fulfilmentMethod: 'delivery',
  deliveryAddress: address,
  pickup: null,
  deliveryZone: null,
  billingAddress: address,
  paymentMethod: 'bank-transfer',
  preferredDate: null,
  customerNote: null,
  customerEmail: 'alex@example.com',
  tierKey: 'wholesale',
  lines: [
    {
      name: 'Espresso cups',
      slug: 'espresso-cups',
      linked: true,
      image: null,
      unit: 'box',
      quantity: 2,
      pieces: 200,
      priceMinor: 1999,
      priceBasisPieces: 10,
      lineTotalMinor: 39980,
      note: null,
    },
  ],
  shipment: {
    cartons: 2,
    volume: null,
    weight: null,
    coveredLines: 1,
    uncoveredLines: 0,
    approximate: false,
  },
};

async function render(answer: OrderRevision | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminOrderRevisionPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      {
        provide: AdminOrdersService,
        useValue: { revision: vi.fn(async () => answer) },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminOrderRevisionPage);
  fixture.componentRef.setInput('reference', version.reference);
  fixture.componentRef.setInput('number', '2');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('AdminOrderRevisionPage (FR-ORD-03)', () => {
  /**
   * The customer's own reading, which is the point of the page: a manager
   * asking what was sent on Tuesday is asking what the customer sees, and a
   * staff rendering of their own would be a second opinion about it.
   */
  it('reads the version as the customer does, in their units', async () => {
    const { el } = await render(version);

    expect(el.textContent).toContain('Espresso cups');
    // Their unit and the pieces behind it — not the basis units staff work in.
    expect(el.textContent).toContain('2 ');
    expect(el.textContent).not.toContain('10 ×');
  });

  it('adds what only the shop knows about the version', async () => {
    const { el } = await render(version);

    expect(el.textContent).toContain('alex@example.com');
    expect(el.textContent).toContain('wholesale');
    // Which version this is, that the customer is on another one, and that
    // they were written to about this one.
    expect(el.textContent).toContain('Version 2');
    expect(el.textContent).toContain('version 3');
    expect(el.textContent).toContain(text.paymentState.awaiting);
  });

  /**
   * The order's files, read from where this page stands (FR-ORD-05): what can
   * be opened is listed, and supplying or sending one is not offered — those
   * are acts on the order, and this screen answers nothing.
   */
  it('lists what can be opened on the order, with nothing to press', async () => {
    const { el } = await render(version);

    expect(el.textContent).toContain(text.documents.summary);
    expect(el.querySelector('a[href*="/api/order-documents/"]')).not.toBeNull();
    expect(el.textContent).not.toContain(text.documents.upload);
  });

  /** Reading is not answering: every control lives one route up. */
  it('offers no control except the way to the screen that has them', async () => {
    const { el } = await render(version);

    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(
      el.querySelector(`a[href="/admin/orders/${version.reference}"]`),
    ).not.toBeNull();
  });

  it('says so where the version is not there', async () => {
    const { el } = await render(null);

    expect(el.textContent).toContain(text.notFound);
  });
});
