import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRow, UsersService } from '../users/users.service';
import { AUTH_COOKIE } from './auth.constants';
import { AuthenticatedRequest } from './authenticated-request';
import { JwtAuthGuard } from './jwt-auth.guard';

const userRow = (overrides: Partial<UserRow> = {}): UserRow =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.com',
    passwordHash: '$argon2id$stored',
    role: 'admin',
    tokenVersion: 0,
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
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
};

describe('JwtAuthGuard', () => {
  const verifyAsync = jest.fn();
  const findById = jest.fn();
  const guard = new JwtAuthGuard(
    { verifyAsync } as unknown as JwtService,
    { findById } as unknown as UsersService,
  );

  beforeEach(() => {
    verifyAsync.mockReset();
    findById.mockReset();
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
    });
  });
});
