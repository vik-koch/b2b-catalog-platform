import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import type { UserRole } from '@b2b-catalog-platform/shared';

/** Over a real server: the role guards must still find their metadata on a
 * handler the contract layer registered. */
describe('OperationsController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let signedInAs: { id: string; role: UserRole } | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [
        {
          provide: OperationsService,
          useValue: {
            getBuildInfo: () => ({ version: '1.5.3', deployedAt: null }),
            listChanges: async () => [],
          },
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

  it('keeps the history admin-only', async () => {
    signedInAs = { id: 'manager-1', role: 'manager' };

    const response = await fetch(`${baseUrl}/api/settings/changes`);

    expect(response.status).toBe(403);
  });
});
