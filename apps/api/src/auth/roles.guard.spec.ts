import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { RolesGuard } from './roles.guard';

const contextWith = (user?: AuthUser): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const admin: AuthUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
  role: 'admin',
};

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  const requireRoles = (roles: unknown) =>
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(roles);

  beforeEach(() => (reflector.getAllAndOverride as jest.Mock).mockReset());

  it('allows any authenticated user when no roles are required', () => {
    requireRoles(undefined);

    expect(guard.canActivate(contextWith({ ...admin, role: 'user' }))).toBe(
      true,
    );
  });

  it('allows a user whose role is in the required set', () => {
    requireRoles(['admin', 'manager']);

    expect(guard.canActivate(contextWith(admin))).toBe(true);
  });

  it('forbids a user whose role is not in the required set', () => {
    requireRoles(['admin']);

    expect(() =>
      guard.canActivate(contextWith({ ...admin, role: 'user' })),
    ).toThrow(ForbiddenException);
  });

  it('forbids when no user is present (JwtAuthGuard missing)', () => {
    requireRoles(['admin']);

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
