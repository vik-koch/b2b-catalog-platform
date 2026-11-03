import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MachineScope } from '../../platform/auth/machine-scope.decorator';
import { Roles } from '../../platform/auth/roles.decorator';
import { Sessions } from '../../platform/auth/sessions';
import { MaintenanceGuard } from './maintenance.guard';
import { MaintenanceState } from './maintenance-state';

const sessionOf = (role: string) => ({ user: { role }, payload: {} });

describe('MaintenanceGuard', () => {
  const isMaintenanceEnabled = vi.fn();
  const read = vi.fn();
  // Emulates the reflector reading metadata off the route: the roles array
  // when the route is marked as auth-guarded, the scope when it is a machine
  // route, or the exempt flag.
  const metadata: { roles?: unknown; scope?: unknown; exempt?: boolean } = {};
  const reflector = {
    getAllAndOverride: (key: unknown) => {
      if (key === Roles) return metadata.roles;
      if (key === MachineScope) return metadata.scope;
      return metadata.exempt;
    },
  } as unknown as Reflector;

  const guard = new MaintenanceGuard(
    reflector,
    { isEnabled: isMaintenanceEnabled } as unknown as MaintenanceState,
    { read } as unknown as Sessions,
  );

  const setHeader = vi.fn();
  const context = () =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({ setHeader }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    isMaintenanceEnabled.mockReset();
    read.mockReset();
    read.mockResolvedValue(null);
    setHeader.mockReset();
    metadata.roles = undefined;
    metadata.scope = undefined;
    metadata.exempt = undefined;
  });

  it('lets every request through when maintenance is off', async () => {
    isMaintenanceEnabled.mockReturnValue(false);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it('503s an anonymous request to a public route when maintenance is on', async () => {
    isMaintenanceEnabled.mockReturnValue(true);

    await expect(guard.canActivate(context())).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '3600');
  });

  it('exempts a staff-only @Auth route', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    metadata.roles = ['admin', 'manager'];

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  // A bare `@Auth()` is where a customer's account pages live: open to a
  // staff session, closed to everyone else.
  it('does not exempt a bare @Auth route by structure', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    metadata.roles = [];

    await expect(guard.canActivate(context())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('closes a bare @Auth route to a customer session', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    metadata.roles = [];
    read.mockResolvedValue(sessionOf('user'));

    await expect(guard.canActivate(context())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('opens a bare @Auth route to a staff session', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    metadata.roles = [];
    read.mockResolvedValue(sessionOf('manager'));

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('exempts a route carrying @Machine scope metadata', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    metadata.scope = 'catalog-sync';

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it('exempts an explicitly @MaintenanceExempt route', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    metadata.exempt = true;

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('lets a valid admin session preview a public route', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    read.mockResolvedValue(sessionOf('admin'));

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('lets a valid manager session preview a public route', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    read.mockResolvedValue(sessionOf('manager'));

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('does not exempt a customer session', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    read.mockResolvedValue(sessionOf('user'));

    await expect(guard.canActivate(context())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('does not exempt a request without a valid session', async () => {
    isMaintenanceEnabled.mockReturnValue(true);

    await expect(guard.canActivate(context())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('503s rather than erroring when the session cannot be read', async () => {
    isMaintenanceEnabled.mockReturnValue(true);
    read.mockRejectedValue(new Error('connection refused'));

    await expect(guard.canActivate(context())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
