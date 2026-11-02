import { ExecutionContext } from '@nestjs/common';
import { SessionUser } from './session-users';
import { AuthenticatedRequest } from './authenticated-request';
import { Session, Sessions } from './sessions';
import { OptionalAuthGuard } from './optional-auth.guard';

const TIER = '00000000-0000-0000-0000-0000000000aa';

const session = (overrides: Partial<SessionUser> = {}): Session => ({
  payload: {
    sub: '00000000-0000-0000-0000-000000000001',
    email: 'customer@example.com',
    role: 'user',
    tokenVersion: 0,
  },
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'customer@example.com',
    role: 'user',
    status: 'active',
    tokenVersion: 0,
    mustChangePassword: false,
    tierId: TIER,
    ...overrides,
  } as SessionUser,
});

const context = () => {
  const request = { cookies: {} } as unknown as AuthenticatedRequest;
  const response = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
};

describe('OptionalAuthGuard', () => {
  const read = vi.fn();
  const renew = vi.fn();
  const guard = new OptionalAuthGuard({ read, renew } as unknown as Sessions);

  beforeEach(() => {
    read.mockReset();
    renew.mockReset();
  });

  it('lets a request without a valid session through as a guest', async () => {
    read.mockResolvedValue(null);
    const { context: ctx, request } = context();

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.pricingTierId).toBeNull();
    expect(request.user).toBeUndefined();
    expect(renew).not.toHaveBeenCalled();
  });

  it('takes the tier from the row, so a re-tiering applies at once', async () => {
    const moved = '00000000-0000-0000-0000-0000000000bb';
    read.mockResolvedValue(session({ tierId: moved }));
    const { context: ctx, request } = context();

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.pricingTierId).toBe(moved);
  });

  it('leaves a staff or default-list account on the default list', async () => {
    read.mockResolvedValue(session({ role: 'admin', tierId: null }));
    const { context: ctx, request } = context();

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.pricingTierId).toBeNull();
    expect(request.user?.role).toBe('admin');
  });

  it('hands the session over to be renewed', async () => {
    const valid = session();
    read.mockResolvedValue(valid);
    const { context: ctx, request, response } = context();

    await guard.canActivate(ctx);
    expect(renew).toHaveBeenCalledWith(request, response, valid);
  });
});
