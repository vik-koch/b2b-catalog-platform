import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRow, UsersService } from '../users/users.service';
import { AUTH_COOKIE } from './auth.constants';
import { AuthenticatedRequest } from './authenticated-request';
import { OptionalAuthGuard } from './optional-auth.guard';

const TIER = '00000000-0000-0000-0000-0000000000aa';

const userRow = (overrides: Partial<UserRow> = {}): UserRow =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'customer@example.com',
    passwordHash: '$argon2id$stored',
    role: 'user',
    status: 'active',
    tokenVersion: 0,
    mustChangePassword: false,
    tierId: TIER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as UserRow;

const validClaims = {
  sub: userRow().id,
  email: userRow().email,
  role: 'user',
  tokenVersion: 0,
};

const contextWith = (cookies: Record<string, string>) => {
  const request = { cookies } as unknown as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
};

/**
 * The point of this guard is what it does *not* do: never reject, and never
 * touch the database for a request that carries no session.
 */
describe('OptionalAuthGuard', () => {
  const verifyAsync = jest.fn();
  const findById = jest.fn();
  const guard = new OptionalAuthGuard(
    { verifyAsync } as unknown as JwtService,
    { findById } as unknown as UsersService,
  );

  beforeEach(() => {
    verifyAsync.mockReset();
    findById.mockReset();
  });

  it('does no work at all without a cookie — the guest and crawler path', async () => {
    const { context, request } = contextWith({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
    expect(request.pricingTierId).toBeNull();
    expect(request.user).toBeUndefined();
  });

  it('serves the default list for a forged or expired token instead of 401ing', async () => {
    verifyAsync.mockRejectedValue(new Error('bad signature'));
    const { context, request } = contextWith({ [AUTH_COOKIE]: 'tampered' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findById).not.toHaveBeenCalled();
    expect(request.pricingTierId).toBeNull();
  });

  it('serves the default list when the account is gone', async () => {
    verifyAsync.mockResolvedValue(validClaims);
    findById.mockResolvedValue(undefined);
    const { context, request } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.pricingTierId).toBeNull();
  });

  it('serves the default list when the session was revoked', async () => {
    verifyAsync.mockResolvedValue({ ...validClaims, tokenVersion: 0 });
    findById.mockResolvedValue(userRow({ tokenVersion: 1 }));
    const { context, request } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.pricingTierId).toBeNull();
    expect(request.user).toBeUndefined();
  });

  it.each(['pending', 'anonymized'] as const)(
    'serves the default list to a %s account, without rejecting it',
    async (status) => {
      verifyAsync.mockResolvedValue(validClaims);
      findById.mockResolvedValue(userRow({ status }));
      const { context, request } = contextWith({ [AUTH_COOKIE]: 'token' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.pricingTierId).toBeNull();
      expect(request.user).toBeUndefined();
    },
  );

  it('takes the tier from the database row, so a re-tiering applies at once', async () => {
    const moved = '00000000-0000-0000-0000-0000000000bb';
    verifyAsync.mockResolvedValue(validClaims);
    findById.mockResolvedValue(userRow({ tierId: moved }));
    const { context, request } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.pricingTierId).toBe(moved);
  });

  it('leaves a staff or default-list account on the default list', async () => {
    verifyAsync.mockResolvedValue(validClaims);
    findById.mockResolvedValue(userRow({ role: 'admin', tierId: null }));
    const { context, request } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.pricingTierId).toBeNull();
    expect(request.user?.role).toBe('admin');
  });
});
