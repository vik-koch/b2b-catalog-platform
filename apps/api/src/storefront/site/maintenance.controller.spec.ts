import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceState } from '../../core/site/maintenance-state';
import { MaintenanceGuard } from '../../core/site/maintenance.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import type { UserRole } from '@b2b-catalog-platform/shared';

/**
 * Over a real server, because the questions here are about what the framework
 * does around the handler rather than what the handler returns: whether the
 * role guards still stand in front of a route the contract layer registered, and whether the maintenance gate still finds the metadata on one.
 */
describe('MaintenanceController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let maintenanceOn = false;
  let signedInAs: { id: string; role: UserRole } | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MaintenanceController],
      providers: [
        {
          provide: MaintenanceState,
          useValue: { isEnabled: () => maintenanceOn },
        },
        // The real gate, with only its identity check stubbed out: the
        // metadata lookup is the whole point of the exercise.
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
          // Throwing rather than declining, as the real guard does: a guard
          // that returns false gets Nest's default 403.
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
  });

  it('answers the public maintenance check to anyone', async () => {
    const response = await fetch(`${baseUrl}/api/maintenance`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
  });

  // The route the storefront asks in order to learn it is in maintenance
  // cannot itself be gated by maintenance. `@MaintenanceExempt()` is metadata
  // the guard reads off the handler, and the contract layer is what registers
  // that handler, so this is the assertion that the two still meet.
  it('keeps answering it while maintenance is on', async () => {
    maintenanceOn = true;

    const response = await fetch(`${baseUrl}/api/maintenance`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
  });
});
