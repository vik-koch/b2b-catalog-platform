import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';

import { CartChangedException } from '../../core/ordering/cart-changed-exception';
import { OrderReader } from '../../core/ordering/order-reader';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { SignedInAs, withSession } from '../../platform/auth/session.fixture';
import { ContractErrorFilter } from '../../platform/orpc/contract-error.filter';
import { CheckoutService } from './checkout.service';
import { CustomerOrdersService } from './customer-orders.service';
import { OrdersController } from './orders.controller';

/** The controller's own refusals (the honeypot, staff) and the one carrying
 * an answer. The storefront enforces them too, but a form that stops offering
 * something is not a server refusing it. */
describe('OrdersController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let signedInAs: SignedInAs | null = null;

  const submit = vi.fn();
  const notifyPlaced = vi.fn();

  const order = {
    lines: [{ slug: 'hafen-espresso', unit: 'piece' as const, pieces: 4 }],
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+49 30 123456',
    },
    fulfilmentMethod: 'pickup' as const,
    party: { name: 'Jane Doe', registrationId: null },
    deliveryAddress: null,
    pickupLocationKey: 'harbour',
    billingAddress: null,
    paymentMethod: 'cash' as const,
    preferredDate: null,
    customerNote: null,
    expectedTotalMinor: 1999,
  };

  beforeAll(async () => {
    const moduleRef = await withSession(
      Test.createTestingModule({
        controllers: [OrdersController],
        providers: [
          { provide: CheckoutService, useValue: { submit, notifyPlaced } },
          { provide: CustomerOrdersService, useValue: {} },
          { provide: OrderReader, useValue: {} },
          { provide: AuditLogger, useValue: { record: vi.fn() } },
          { provide: APP_FILTER, useClass: ContractErrorFilter },
        ],
      })
        .overrideGuard(ThrottlerGuard)
        .useValue({ canActivate: () => true }),
      () => signedInAs,
    ).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signedInAs = null;
    submit
      .mockReset()
      .mockResolvedValue({ reference: 'X-1', publicToken: 't' });
    notifyPlaced.mockReset().mockResolvedValue(undefined);
  });

  const place = (body: unknown = order) =>
    fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it.each(['admin', 'manager'] as const)(
    'refuses a %s session',
    async (role) => {
      signedInAs = { id: 'u1', email: 'staff@example.com', role };

      const response = await place();

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        defined: true,
        code: 'staff-cannot-order',
      });
      expect(submit).not.toHaveBeenCalled();
    },
  );

  it('lets a customer through', async () => {
    signedInAs = { id: 'u2', email: 'jane@example.com', role: 'user' };

    const response = await place();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      reference: 'X-1',
      publicToken: 't',
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('lets a guest through', async () => {
    const response = await place();

    expect(response.status).toBe(201);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  // Refused rather than silently accepted: unlike the inquiry form, an order
  // the customer believes was placed and was not is worse than a refusal.
  it('refuses a submission that tripped the honeypot', async () => {
    const response = await place({ ...order, website: 'http://spam.example' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'rejected' });
    expect(submit).not.toHaveBeenCalled();
  });

  // The one refusal that carries an answer: the fresh pricing rides along so
  // the page can show what moved instead of asking again. The payload is held
  // to the contract like any response: one that did not match would become an
  // undefined error.
  it('sends the re-priced cart back with the refusal that caused it', async () => {
    const preview = {
      lines: [],
      totalMinor: 2099,
      complete: true,
      shipment: {
        cartons: 1,
        volume: null,
        weight: null,
        coveredLines: 1,
        uncoveredLines: 0,
        approximate: false,
      },
    };
    submit.mockRejectedValue(new CartChangedException({ preview } as never));

    const response = await place();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'cart-changed',
      data: { preview },
    });
  });
});
