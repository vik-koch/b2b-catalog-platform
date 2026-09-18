import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuditLogger } from '../audit/audit.logger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ContractErrorFilter } from '../orpc/contract-error.filter';
import { SettingsService } from '../settings/settings.service';
import { AdminOrdersController } from './admin-orders.controller';
import { demoAdminOrder } from './order.fixture';
import { OrdersService } from './orders.service';

/**
 * Order processing as an owned area (FR-ADM-10). The rule only shows itself
 * over HTTP: what a screen stops offering is not the same as what the server
 * refuses, and the refusal has to arrive as the contract code rather than as a
 * message.
 */
describe('AdminOrdersController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let actor: { id: string; role: string } = { id: 'admin-1', role: 'admin' };
  /** Which areas an external system holds, per test. */
  let ownedAreas: string[] = [];

  const reference = demoAdminOrder.reference;
  const listAll = vi.fn();
  const getForStaff = vi.fn();
  const transitionForStaff = vi.fn();
  const getRevisions = vi.fn();
  const getRevision = vi.fn();
  const previewAdjustment = vi.fn();
  const adjust = vi.fn();
  const showCustomerCurrent = vi.fn();
  const setPayment = vi.fn();

  /** The order every handler here answers with. A whole one, because the
   * contract's output schema is strict: a thin stand-in answers 500 rather
   * than the 200 these cases are about. */
  const answered = { ...demoAdminOrder, status: 'approved' as const };

  /** What the pricing route answers: the order's own lines, priced, with the
   * flags the screen reads. Built off the fixture so the strict output schema
   * is satisfied without a second copy of an order here. */
  const preview = {
    lines: demoAdminOrder.lines.map((line) => ({
      ...line,
      flags: [],
      listPriceMinor: line.priceMinor,
    })),
    totalMinor: demoAdminOrder.totalMinor,
    currency: demoAdminOrder.currency,
    deliveryZone: demoAdminOrder.deliveryZone,
    shipment: demoAdminOrder.shipment,
  };

  const adjustment = {
    lines: [
      {
        slug: 'hafen-espresso',
        pieces: 4,
        unit: 'piece',
        note: null,
        priceMinor: null,
      },
    ],
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+49 30 123456',
    },
    party: { name: 'Jane Doe', registrationId: null },
    fulfilmentMethod: 'pickup',
    deliveryAddress: null,
    pickupLocationKey: 'harbour',
    billingAddress: null,
    paymentMethod: 'cash',
    tierKey: null,
    note: 'Two boxes short',
    notify: false,
    basedOnRevision: 1,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminOrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: {
            listAll,
            getForStaff,
            transitionForStaff,
            getRevisions,
            getRevision,
            previewAdjustment,
            adjust,
            showCustomerCurrent,
            setPayment,
          },
        },
        { provide: AuditLogger, useValue: { record: vi.fn() } },
        {
          provide: SettingsService,
          useValue: {
            isExternallyOwned: (area: string) => ownedAreas.includes(area),
          },
        },
        { provide: APP_FILTER, useClass: ContractErrorFilter },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          if (!actor) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = actor;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    actor = { id: 'admin-1', role: 'admin' };
    ownedAreas = [];
    for (const call of [
      listAll,
      getForStaff,
      transitionForStaff,
      getRevisions,
      getRevision,
      previewAdjustment,
      adjust,
      showCustomerCurrent,
      setPayment,
    ]) {
      call.mockReset();
    }
  });

  const send = (path: string, method: string, body?: unknown) =>
    fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const writes: [string, string, string, unknown?][] = [
    [
      'move an order',
      `/admin/orders/${reference}/status`,
      'POST',
      {
        to: 'approved',
        reason: null,
        notify: true,
        showCustomer: true,
        markPaid: false,
      },
    ],
    [
      'price an adjustment',
      `/admin/orders/${reference}/adjustment/preview`,
      'POST',
      adjustment,
    ],
    [
      'write an adjustment',
      `/admin/orders/${reference}/adjustment`,
      'POST',
      adjustment,
    ],
    [
      'tell the customer',
      `/admin/orders/${reference}/notify`,
      'POST',
      { notify: true },
    ],
    [
      'record a payment',
      `/admin/orders/${reference}/payment`,
      'POST',
      { paid: true },
    ],
  ];

  /**
   * A sweep rather than a case per handler, for the reason the customer area's
   * is one: what is being tested is that nothing was missed, and a per-handler
   * test proves only the handlers somebody remembered.
   */
  describe('while an external system owns order processing', () => {
    beforeEach(() => {
      ownedAreas = ['orders'];
    });

    it.each(writes)('refuses to %s', async (_what, path, method, body) => {
      const response = await send(path, method, body);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        defined: true,
        code: 'orders-externally-owned',
      });
      for (const call of [
        transitionForStaff,
        previewAdjustment,
        adjust,
        showCustomerCurrent,
        setPayment,
      ]) {
        expect(call).not.toHaveBeenCalled();
      }
    });

    // The screens stay readable while every action on them is refused: staff
    // must be able to see what the customer sees, and the work counts are read
    // from these rows.
    it('still answers every read', async () => {
      listAll.mockResolvedValue({
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      });
      getForStaff.mockResolvedValue(answered);
      getRevisions.mockResolvedValue([]);

      expect((await send('/admin/orders', 'GET')).status).toBe(200);
      expect((await send(`/admin/orders/${reference}`, 'GET')).status).toBe(
        200,
      );
      expect(
        (await send(`/admin/orders/${reference}/revisions`, 'GET')).status,
      ).toBe(200);
    });
  });

  // The other half of the switch: nothing here is refused while the shop
  // answers its own orders.
  it.each(writes)(
    'lets the shop %s while it owns them',
    async (_what, path, method, body) => {
      transitionForStaff.mockResolvedValue(answered);
      previewAdjustment.mockResolvedValue(preview);
      adjust.mockResolvedValue(answered);
      showCustomerCurrent.mockResolvedValue(answered);
      setPayment.mockResolvedValue(answered);

      const response = await send(path, method, body);

      expect(response.status).toBe(200);
    },
  );

  // Handing the *catalog* over says nothing about who answers an order.
  it('refuses nothing while another area is the owned one', async () => {
    ownedAreas = ['catalog', 'customers'];
    setPayment.mockResolvedValue(answered);

    const response = await send(`/admin/orders/${reference}/payment`, 'POST', {
      paid: true,
    });

    expect(response.status).toBe(200);
    expect(setPayment).toHaveBeenCalled();
  });
});
