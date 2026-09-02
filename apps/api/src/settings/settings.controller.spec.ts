import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { MaintenanceGuard } from './maintenance.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/**
 * Over a real server, because the questions here are about what the framework
 * does around the handler rather than what the handler returns: whether the
 * maintenance gate still finds the metadata on a route the contract layer
 * registered, and whether the role guards still stand in front of one.
 */
describe('SettingsController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let maintenanceOn = false;
  let signedInAs: { id: string; role: string } | null = null;

  const settings = {
    isMaintenanceEnabled: () => maintenanceOn,
    getBuildInfo: () => ({ version: '1.5.3', deployedAt: null }),
    getMaintenance: async () => ({
      enabled: maintenanceOn,
      updatedAt: '2026-09-02T10:00:00.000Z',
    }),
    setMaintenance: vi.fn(async (enabled: boolean) => ({
      enabled,
      updatedAt: '2026-09-02T10:00:00.000Z',
    })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: SettingsService, useValue: settings },
        // The real gate, with only its identity check stubbed out — the
        // metadata lookup is the whole point of the exercise.
        {
          provide: APP_GUARD,
          inject: [Reflector, SettingsService],
          useFactory: (reflector: Reflector, s: SettingsService) =>
            new MaintenanceGuard(
              reflector,
              s,
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
          // Throwing rather than declining, as the real guard does — a guard
          // that returns false gets Nest's default 403.
          if (!signedInAs) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = signedInAs;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (context: {
          getHandler(): unknown;
          getClass(): unknown;
        }) => {
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
    maintenanceOn = false;
    signedInAs = null;
    settings.setMaintenance.mockClear();
  });

  it('answers the public maintenance check to anyone', async () => {
    const response = await fetch(`${baseUrl}/api/maintenance`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
  });

  // The route the storefront asks in order to learn it is in maintenance
  // cannot itself be gated by maintenance. `@MaintenanceExempt()` is metadata
  // the guard reads off the handler, and the contract layer is what registers
  // that handler — so this is the assertion that the two still meet.
  it('keeps answering it while maintenance is on', async () => {
    maintenanceOn = true;

    const response = await fetch(`${baseUrl}/api/maintenance`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
  });

  // Its `@Auth(...)` roles metadata is the other exemption the gate looks for,
  // and it must survive the same round trip.
  it('leaves the admin routes reachable while maintenance is on', async () => {
    maintenanceOn = true;
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/maintenance`);

    expect(response.status).toBe(200);
  });

  it('refuses the build info to nobody signed in', async () => {
    const response = await fetch(`${baseUrl}/api/settings/build-info`);

    expect(response.status).toBe(401);
  });

  it('gives the build info to a manager, not only an admin', async () => {
    signedInAs = { id: 'manager-1', role: 'manager' };

    const response = await fetch(`${baseUrl}/api/settings/build-info`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: '1.5.3',
      deployedAt: null,
    });
  });

  it('refuses the maintenance toggle to a manager', async () => {
    signedInAs = { id: 'manager-1', role: 'manager' };

    const response = await fetch(`${baseUrl}/api/settings/maintenance`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });

    expect(response.status).toBe(403);
    expect(settings.setMaintenance).not.toHaveBeenCalled();
  });

  it('lets an admin flip it, and hands the service the signed-in id', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/maintenance`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });

    expect(response.status).toBe(200);
    expect(settings.setMaintenance).toHaveBeenCalledWith(true, 'admin-1');
  });

  // strict: unknown keys are rejected, not stripped (NFR-SEC-05).
  it('rejects a toggle body carrying anything else', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/maintenance`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, updatedAt: 'now' }),
    });

    expect(response.status).toBe(400);
    expect(settings.setMaintenance).not.toHaveBeenCalled();
  });
});
