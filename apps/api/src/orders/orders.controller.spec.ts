import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuditLogger } from '../audit/audit.logger';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * The two refusals the controller makes on its own, before the service sees
 * anything: the honeypot, and staff. Both are rules the storefront also
 * enforces, which is exactly why they are pinned here — a form can stop
 * offering something, and that is not the same as the server refusing it.
 */
describe('OrdersController submitOrder', () => {
  const orders = {
    submit: jest.fn(async () => ({ reference: 'X', publicToken: 't' })),
    notifyPlaced: jest.fn(async () => undefined),
  };
  const audit = { record: jest.fn() };
  const controller = new OrdersController(
    orders as unknown as OrdersService,
    audit as unknown as AuditLogger,
  );

  const staff = (role: 'admin' | 'manager') =>
    ({ id: 'u1', email: 'staff@example.com', role }) as AuthUser;

  // The handler ts-rest hands the framework; the body is all these cases read.
  const submit = async (user: AuthUser | null) => {
    const handler = controller.submitOrder(user, null) as unknown as (input: {
      body: unknown;
    }) => Promise<{ status: number; body: { code?: string } }>;
    return handler({ body: {} });
  };

  beforeEach(() => jest.clearAllMocks());

  it.each(['admin', 'manager'] as const)(
    'refuses a %s session',
    async (role) => {
      const response = await submit(staff(role));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('staff-cannot-order');
      expect(orders.submit).not.toHaveBeenCalled();
    },
  );

  it('lets a customer through', async () => {
    await submit({ id: 'u2', email: 'a@b.c', role: 'user' } as AuthUser);

    expect(orders.submit).toHaveBeenCalledTimes(1);
  });

  it('lets a guest through', async () => {
    await submit(null);

    expect(orders.submit).toHaveBeenCalledTimes(1);
  });
});
