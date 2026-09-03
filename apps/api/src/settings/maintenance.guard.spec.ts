import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRow, UsersService } from '../users/users.service';
import { AUTH_COOKIE } from '../auth/auth.constants';
import { Roles } from '../auth/roles.decorator';
import { MaintenanceGuard } from './maintenance.guard';
import { SettingsService } from './settings.service';

const adminRow = (overrides: Partial<UserRow> = {}): UserRow =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.com',
    passwordHash: '$argon2id$stored',
    role: 'admin',
    tokenVersion: 0,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as UserRow;

const adminClaims = {
  sub: adminRow().id,
  email: adminRow().email,
  role: 'admin',
  tokenVersion: 0,
};

describe('MaintenanceGuard', () => {
  const isMaintenanceEnabled = vi.fn();
  const verifyAsync = vi.fn();
  const findById = vi.fn();
  // Emulates the reflector reading metadata off the route: returns the roles
  // array when the route is marked as auth-guarded, or the exempt flag.
  const metadata: { roles?: unknown; exempt?: boolean } = {};
  const reflector = {
    getAllAndOverride: (key: unknown) =>
      key === Roles ? metadata.roles : metadata.exempt,
  } as unknown as Reflector;

  const guard = new MaintenanceGuard(
    reflector,
    { isMaintenanceEnabled } as unknown as SettingsService,
    { verifyAsync } as unknown as JwtService,
    { findById } as unknown as UsersService,
  );

  const setHeader = vi.fn();
  const contextWith = (cookies: Record<string, string>) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ cookies }),
        getResponse: () => ({ setHeader }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    isMaintenanceEnabled.mockReset();
    verifyAsync.mockReset();
    findById.mockReset();
    setHeader.mockReset();
    metadata.roles = undefined;
    metadata.exempt = undefined;
  });

  it('lets every request through when maintenance is off', async () => {
    isMaintenanceEnabled.mockReturnValue(false);

    await expect(guard.canActivate(contextWith({}))).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('503s an anonymous request to a public route when maintenance is on', async () => {
    isMaintenanceEnabled.mockReturnValue(true);

    await expect(guard.canActivate(contextWith({}))).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '3600');
  });

  it('exempts a route carrying @Auth role metadata (even an empty list)', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    metadata.roles = [];

    await expect(guard.canActivate(contextWith({}))).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('exempts an explicitly @MaintenanceExempt route', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    metadata.exempt = true;

    await expect(guard.canActivate(contextWith({}))).resolves.toBe(true);
  });

  it('lets a valid admin session preview a public route', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    verifyAsync.mockResolvedValue(adminClaims);
    findById.mockResolvedValue(adminRow());

    await expect(
      guard.canActivate(contextWith({ [AUTH_COOKIE]: 'good' })),
    ).resolves.toBe(true);
  });

  it('does not exempt a non-admin session', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    verifyAsync.mockResolvedValue({ ...adminClaims, role: 'user' });
    findById.mockResolvedValue(adminRow({ role: 'user' }));

    await expect(
      guard.canActivate(contextWith({ [AUTH_COOKIE]: 'good' })),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not exempt a session whose token version is stale', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    verifyAsync.mockResolvedValue(adminClaims);
    findById.mockResolvedValue(adminRow({ tokenVersion: 1 }));

    await expect(
      guard.canActivate(contextWith({ [AUTH_COOKIE]: 'good' })),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('swallows a bad token and 503s rather than erroring', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    verifyAsync.mockRejectedValue(new Error('bad signature'));

    await expect(
      guard.canActivate(contextWith({ [AUTH_COOKIE]: 'tampered' })),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
