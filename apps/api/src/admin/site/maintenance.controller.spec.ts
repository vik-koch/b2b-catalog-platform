import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AdminMaintenanceController } from './maintenance.controller';
import { MaintenanceSwitch } from './maintenance-switch';
import { MaintenanceGuard } from '../../core/site/maintenance.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import type { UserRole } from '@b2b-catalog-platform/shared';

/** Over a real server: the role guards and the gate must still find their
 * metadata on a handler the contract layer registered. */
describe('AdminMaintenanceController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let maintenanceOn = false;
  const maintenance = {
    read: async () => ({ enabled: maintenanceOn }),
    set: vi.fn(async (enabled: boolean) => ({ enabled })),
  };
  let signedInAs: { id: string; role: UserRole } | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminMaintenanceController],
      providers: [
        { provide: MaintenanceSwitch, useValue: maintenance },
        // The real gate, with no session to find.
        {
          provide: APP_GUARD,
          inject: [Reflector],
          useFactory: (reflector: Reflector) =>
            new MaintenanceGuard(
              reflector,
              { isEnabled: () => maintenanceOn } as never,
              { verifyAsync: async () => ({}) } as never,
              { findById: async () => null } as never,
            ),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          // Throws like the real guard: a `false` would be a 403.
          if (!signedInAs) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = signedInAs;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const roles = new Reflector().getAllAndOverride(Roles, [
            context.getHandler(),
            context.getClass(),
          ]);
          return (
            !!signedInAs && (!roles?.length || roles.includes(signedInAs.role))
          );
        },
      })
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
    signedInAs = null;
    maintenanceOn = false;
    maintenance.set.mockClear();
  });

  it('stays reachable to an admin while maintenance is on', async () => {
    maintenanceOn = true;
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/maintenance`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
  });

  it('refuses the toggle to a manager', async () => {
    signedInAs = { id: 'manager-1', role: 'manager' };

    const response = await fetch(`${baseUrl}/api/settings/maintenance`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });

    expect(response.status).toBe(403);
    expect(maintenance.set).not.toHaveBeenCalled();
  });

  it('lets an admin flip it, and hands the switch the signed-in account', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/maintenance`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });

    expect(response.status).toBe(200);
    // The trail keeps the address for after the account is gone.
    expect(maintenance.set).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ id: 'admin-1' }),
    );
  });

  it('rejects a toggle body carrying anything else', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/maintenance`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, updatedAt: 'now' }),
    });

    expect(response.status).toBe(400);
    expect(maintenance.set).not.toHaveBeenCalled();
  });
});
