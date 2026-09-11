import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AdminOrderDetail,
  OrderAdjustment,
  OrderAdjustmentPreview,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { TiersService } from '../tiers/tiers.service';
import { AdminOrderAdjustPage } from './order-adjust-page';
import { AdminOrdersService } from './orders.service';

const text = defaultAdminText.orderAdjust;

const address = {
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE' as const,
};

/** A box of a hundred, priced per ten: two basis units to the line. */
const order: AdminOrderDetail = {
  reference: 'DEMO-260826-4831',
  status: 'requested',
  paymentState: 'not-due',
  statusReason: null,
  changes: [],
  documents: [
    {
      kind: 'order-summary' as const,
      source: 'generated' as const,
      fileName: 'summary.pdf',
      contentType: 'application/pdf',
      byteSize: null,
      suppliedAt: null,
      suppliedForRevision: null,
      outdated: false,
      notifiedAt: null,
    },
  ],
  revisionNumber: 1,
  customerRevisionNumber: 1,
  notifiedRevisionNumber: 1,
  notifiedStatuses: ['requested'],
  paidAt: null,
  createdAt: '2026-08-26T09:15:00.000Z',
  statusChangedAt: '2026-08-26T09:15:00.000Z',
  totalMinor: 3980,
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
  customerNote: 'Ring the bell twice',
  publicToken: null,
  customerEmail: 'alex@example.com',
  tierKey: null,
  lines: [
    {
      name: 'Espresso cups',
      slug: 'espresso-cups',
      linked: true,
      image: null,
      unit: 'pack',
      quantity: 2,
      pieces: 20,
      priceMinor: 199,
      lineTotalMinor: 3980,
      note: null,
    },
  ],
  shipment: {
    cartons: 1,
    volume: null,
    weight: null,
    coveredLines: 1,
    uncoveredLines: 0,
    approximate: false,
  },
};

/** The server's answer to whatever the form currently says — here, the order
 * unchanged, which is what an untouched form must produce. */
const preview: OrderAdjustmentPreview = {
  lines: [
    {
      ...order.lines[0],
      flags: [],
      listPriceMinor: 199,
    },
  ],
  totalMinor: 3980,
  currency: 'EUR',
  deliveryZone: null,
  shipment: order.shipment,
};

function render(
  api: Partial<{
    previewAdjustment: unknown;
    adjust: unknown;
  }> = {},
) {
  const previewAdjustment = vi.fn(
    async (_reference: string, _body: OrderAdjustment) => ({
      ok: true as const,
      preview,
    }),
  );

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminOrderAdjustPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      {
        provide: AdminOrdersService,
        useValue: {
          get: vi.fn(async () => order),
          previewAdjustment,
          adjust: vi.fn(async () => ({ ok: true as const, order })),
          ...api,
        },
      },
      // The dialog itself is its own suite; here it always says yes.
      { provide: ConfirmService, useValue: { ask: vi.fn(async () => true) } },
      {
        provide: TiersService,
        useValue: {
          list: vi.fn(async () => ({
            tiers: [
              {
                id: 't1',
                key: 'wholesale',
                label: 'Wholesale',
                userCount: 0,
                priceCount: 0,
                sortOrder: 0,
              },
            ],
            defaultUserCount: 0,
          })),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminOrderAdjustPage);
  fixture.componentRef.setInput('reference', order.reference);
  return { fixture, previewAdjustment };
}

async function settled(api: Parameters<typeof render>[0] = {}) {
  const { fixture, previewAdjustment } = render(api);
  await fixture.whenStable();
  fixture.detectChanges();
  // The draft is priced once the form holds still, so the test has to hold
  // still with it: a debounce is a real timer, and nothing is on screen until
  // it has fired.
  await new Promise((resolve) => setTimeout(resolve, 400));
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    previewAdjustment,
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('AdminOrderAdjustPage (FR-ORD-03)', () => {
  it('starts as the order on file', async () => {
    const { el, previewAdjustment } = await settled();

    const body = previewAdjustment.mock.calls.at(-1)?.[1];
    if (!body) throw new Error('the draft was never priced');
    expect(body.lines).toEqual([
      {
        slug: 'espresso-cups',
        // Twenty pieces, which is what two packs of ten is to staff.
        pieces: 20,
        unit: 'pack',
        note: null,
        priceMinor: 199,
      },
    ]);
    expect(body.paymentMethod).toBe('bank-transfer');
    expect(body.party).toEqual(order.party);
    expect(body.basedOnRevision).toBe(1);
    // An untouched form changes nothing, so the list beside it says so.
    expect(el.textContent).toContain(text.changes.none);
  });

  it('shows what the customer wrote, without offering to change it', async () => {
    const { el } = await settled();

    expect(el.textContent).toContain('Ring the bell twice');
    const editable = [...el.querySelectorAll('input, textarea')].map(
      (field) => (field as HTMLInputElement).value,
    );
    expect(editable).not.toContain('Ring the bell twice');
  });

  it('names what changed, old beside new', async () => {
    const changed: OrderAdjustmentPreview = {
      ...preview,
      lines: [
        {
          ...preview.lines[0],
          quantity: 1,
          pieces: 10,
          lineTotalMinor: 1990,
        },
      ],
      totalMinor: 1990,
    };
    const { el } = await settled({
      previewAdjustment: vi.fn(async () => ({
        ok: true as const,
        preview: changed,
      })),
    });

    expect(el.textContent).toContain(text.changes.total);
    expect(el.textContent).toMatch(/39[.,]80/);
    expect(el.textContent).toMatch(/19[.,]90/);
  });

  // Optional in the contract, asked for here: the customer is emailed it, and
  // an order that changed with nothing said about it is the one thing an
  // adjustment must never be.
  it('refuses to save without saying what changed', async () => {
    const adjust = vi.fn();
    const { fixture, el } = await settled({ adjust });

    (el.querySelector('aside button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(adjust).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.noteRequired);
  });

  it('words a refusal by its code, never by the exception', async () => {
    const { fixture, el } = await settled({
      adjust: vi.fn(async () => ({
        ok: false as const,
        code: 'order-changed' as const,
      })),
    });

    const page = fixture.componentInstance as unknown as {
      note: { set: (value: string) => void };
    };
    page.note.set('Cut to one pack, as agreed');
    fixture.detectChanges();
    // The confirmation is the dialog's own suite; what this asserts is the
    // wording of the answer.
    await (
      fixture.componentInstance as unknown as { save: () => Promise<void> }
    ).save();
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Error');
    expect(el.textContent).toContain(text.errors['order-changed']);
  });

  /** A note is an account of a change and not a change of its own, so the
   * server refuses a version that would say what the order already says — and
   * the screen has to explain that rather than blame the note. */
  it('says so when nothing under the note actually changed', async () => {
    const { fixture, el } = await settled({
      adjust: vi.fn(async () => ({
        ok: false as const,
        code: 'no-change' as const,
      })),
    });

    const page = fixture.componentInstance as unknown as {
      note: { set: (value: string) => void };
      save: () => Promise<void>;
    };
    page.note.set('Spoke to Ada, nothing to do');
    fixture.detectChanges();
    await page.save();
    fixture.detectChanges();

    expect(el.textContent).toContain(text.errors['no-change']);
  });
});
