import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OwnershipController } from './ownership.controller';
import { OwnershipSwitch } from './ownership-switch';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { UserRole } from '@b2b-catalog-platform/shared';

/**
 * Over a real server, because the questions here are about what the framework
 * does around the handler rather than what the handler returns: whether the
 * role guards still stand in front of a route the contract layer registered.
 */
describe('OwnershipController (FR-ADM-10)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const ownership = {
    read: async () => ({ ownedAreas: [] }),
    set: vi.fn(async (areas: string[]) => ({ ownedAreas: areas })),
  };
  let signedInAs: { id: string; role: UserRole } | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OwnershipController],
      providers: [{ provide: OwnershipSwitch, useValue: ownership }],
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
    ownership.set.mockClear();
  });

  it('refuses the switch to a manager', async () => {
    // The same rule as maintenance mode: it is a deployment-shaped decision,
    // and a manager approving registrations is not the person making it.
    signedInAs = { id: 'manager-1', role: 'manager' };

    const response = await fetch(`${baseUrl}/api/settings/ownership`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ areas: ['catalog'], owned: true }),
    });

    expect(response.status).toBe(403);
    expect(ownership.set).not.toHaveBeenCalled();
  });

  it('hands the areas and the signed-in account to the switch', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/ownership`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ areas: ['catalog', 'customers'], owned: true }),
    });

    expect(response.status).toBe(200);
    expect(ownership.set).toHaveBeenCalledWith(
      ['catalog', 'customers'],
      true,
      expect.objectContaining({ id: 'admin-1' }),
    );
  });

  it('refuses an area nobody wrote a guard for', async () => {
    // The area set is closed in code, so an unknown one is a 400 rather than
    // a setting quietly stored that no guard will ever read.
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/ownership`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ areas: ['everything'], owned: true }),
    });

    expect(response.status).toBe(400);
    expect(ownership.set).not.toHaveBeenCalled();
  });

  it('refuses a request that names no area at all', async () => {
    // An empty list asks for nothing, and would answer with the owned areas
    // as though something had been done.
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/settings/ownership`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ areas: [], owned: true }),
    });

    expect(response.status).toBe(400);
    expect(ownership.set).not.toHaveBeenCalled();
  });
});
