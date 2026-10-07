import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRow, UsersService } from '../users/users.service';
import { AUTH_COOKIE } from './auth.constants';
import { AuthenticatedRequest } from './authenticated-request';
import { Sessions } from './sessions';
import { JwtAuthGuard } from './jwt-auth.guard';

const userRow = (overrides: Partial<UserRow> = {}): UserRow =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.com',
    passwordHash: '$argon2id$stored',
    role: 'admin',
    status: 'active',
    tokenVersion: 0,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as UserRow;

const validClaims = {
  sub: userRow().id,
  email: userRow().email,
  role: 'admin',
  tokenVersion: 0,
};

const contextWith = (cookies: Record<string, string>) => {
  const request = { cookies } as unknown as AuthenticatedRequest;
  const response = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
};

describe('JwtAuthGuard', () => {
  const verifyAsync = vi.fn();
  const findById = vi.fn();
  const renew = vi.fn();
  const guard = new JwtAuthGuard(
    { verifyAsync } as unknown as JwtService,
    { findById } as unknown as UsersService,
    { renew } as unknown as Sessions,
  );

  beforeEach(() => {
    verifyAsync.mockReset();
    findById.mockReset();
    renew.mockReset();
  });

  it('rejects a request with no session cookie', async () => {
    const { context } = contextWith({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects when token verification fails', async () => {
    verifyAsync.mockRejectedValue(new Error('bad signature'));
    const { context } = contextWith({ [AUTH_COOKIE]: 'tampered' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects when the user no longer exists', async () => {
    verifyAsync.mockResolvedValue(validClaims);
    findById.mockResolvedValue(undefined);
    const { context } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the tokenVersion is stale (e.g. password changed)', async () => {
    verifyAsync.mockResolvedValue({ ...validClaims, tokenVersion: 0 });
    findById.mockResolvedValue(userRow({ tokenVersion: 1 }));
    const { context } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it.each(['pending', 'anonymized'] as const)(
    'rejects a %s account holding an otherwise valid session',
    async (status) => {
      verifyAsync.mockResolvedValue(validClaims);
      findById.mockResolvedValue(userRow({ status }));
      const { context } = contextWith({ [AUTH_COOKIE]: 'token' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    },
  );

  it('uses the DB role, not the token role, on success', async () => {
    // Token was issued while the user was admin; the DB has since demoted them.
    verifyAsync.mockResolvedValue({ ...validClaims, role: 'admin' });
    findById.mockResolvedValue(userRow({ role: 'user' }));
    const { context, request } = contextWith({ [AUTH_COOKIE]: 'token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: userRow().id,
      email: userRow().email,
      role: 'user',
      mustChangePassword: false,
    });
  });
  // Whether it is old enough to reissue is Sessions' call; the guard only
  // hands over a session that proved valid.
  it('hands a valid session over to be renewed', async () => {
    // One row for both sides: two userRow() calls can straddle a millisecond.
    const row = userRow();
    verifyAsync.mockResolvedValue(validClaims);
    findById.mockResolvedValue(row);
    const { context, request, response } = contextWith({
      [AUTH_COOKIE]: 'token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(renew).toHaveBeenCalledWith(request, response, validClaims, row);
  });

  it('renews nothing it did not accept', async () => {
    verifyAsync.mockResolvedValue({ ...validClaims, tokenVersion: 0 });
    findById.mockResolvedValue(userRow({ tokenVersion: 1 }));
    const { context } = contextWith({ [AUTH_COOKIE]: 'token' });

    await guard.canActivate(context).catch(() => undefined);
    expect(renew).not.toHaveBeenCalled();
  });
});
