import {
  ConflictException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { StaffUsersController } from './staff-users.controller';
import { StaffUsersService } from './staff-users.service';
import { AccountInvitations } from './account-invitations';
import { AuditLogger } from '../audit/audit.logger';
import { ContractErrorFilter } from '../orpc/contract-error.filter';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

/**
 * The role boundary is the whole point of this surface, and it is the kind of
 * rule that only shows itself over HTTP: a manager's refusal has to arrive as
 * a code the editor can put next to the field, while a staff account they may
 * not touch has to arrive as a 404 rather than a 403.
 */
describe('StaffUsersController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let actor: { id: string; role: string } = { id: 'admin-1', role: 'admin' };

  const list = vi.fn();
  const findById = vi.fn();
  const update = vi.fn();
  const create = vi.fn();

  const customer = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'jane@example.com',
    role: 'user' as const,
    status: 'active' as const,
    firstName: 'Jane',
    lastName: 'Doe',
    phone: null,
    customerType: null,
    companyName: null,
    companyRegistrationId: null,
    tierId: null,
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-05T09:00:00.000Z',
    approvedAt: null,
    approvedBy: null,
  };
  const staffMember = {
    ...customer,
    id: '22222222-2222-4222-8222-222222222222',
    role: 'manager' as const,
  };

  /** A whole valid edit — the editor always posts the complete field set. */
  const edit = {
    firstName: 'Jane',
    lastName: 'Doe',
    phone: null,
    customerType: null,
    companyName: null,
    companyRegistrationId: null,
    tierId: null,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StaffUsersController],
      providers: [
        {
          provide: StaffUsersService,
          useValue: { list, findById, update, purgePending: vi.fn() },
        },
        { provide: AccountInvitations, useValue: { create } },
        { provide: AuditLogger, useValue: { record: vi.fn() } },
        { provide: APP_FILTER, useClass: ContractErrorFilter },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          if (!actor) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = actor;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
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
    actor = { id: 'admin-1', role: 'admin' };
    list.mockReset();
    findById.mockReset();
    update.mockReset();
    create.mockReset();
  });

  const send = (path: string, method: string, body?: unknown) =>
    fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // A crafted request, not an honest click: the route guard lets a manager in,
  // so the narrowing has to happen here.
  it('forces a manager’s list query down to customers', async () => {
    actor = { id: 'manager-1', role: 'manager' };
    list.mockResolvedValue([]);

    const response = await send('/admin/users?kind=staff&role=admin', 'GET');

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'customer', role: undefined }),
    );
  });

  it('leaves an admin’s query alone', async () => {
    list.mockResolvedValue([]);

    await send('/admin/users?kind=staff', 'GET');

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'staff' }),
    );
  });

  // Not found rather than forbidden: the list hides staff from a manager, so
  // confirming one exists here would undo that.
  it('answers 404, not 403, when a manager reaches a staff account', async () => {
    actor = { id: 'manager-1', role: 'manager' };
    findById.mockResolvedValue(staffMember);

    const response = await send(`/admin/users/${staffMember.id}`, 'GET');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'account-not-found',
    });
  });

  // This one *is* a 403, and its code has to survive: the editor shows it next
  // to the field that was refused rather than redirecting away from the edit.
  it('refuses a manager’s role change by name', async () => {
    actor = { id: 'manager-1', role: 'manager' };
    findById.mockResolvedValue(customer);

    const response = await send(`/admin/users/${customer.id}`, 'PATCH', {
      ...edit,
      role: 'manager',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'role-change-admin-only',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a manager creating staff by name', async () => {
    actor = { id: 'manager-1', role: 'manager' };

    const response = await send('/admin/users', 'POST', {
      email: 'new@example.com',
      role: 'manager',
      tierId: null,
      firstName: 'New',
      lastName: 'Colleague',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'staff-create-admin-only',
    });
    expect(create).not.toHaveBeenCalled();
  });

  // The service raises its refusals as Nest exceptions, which oRPC does not
  // recognise on its own — this is the `refusals` middleware doing its job on
  // a real route rather than on a probe.
  it('carries a service refusal through as its declared code', async () => {
    findById.mockResolvedValue(customer);
    update.mockRejectedValue(
      new ConflictException({
        code: 'last-admin',
        message: 'This is the only admin account',
      }),
    );

    const response = await send(`/admin/users/${customer.id}`, 'PATCH', {
      ...edit,
      firstName: 'Janet',
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'last-admin',
    });
  });

  it('rejects an id that is not a uuid before reaching the service', async () => {
    const response = await send('/admin/users/not-a-uuid', 'GET');

    expect(response.status).toBe(400);
    expect(findById).not.toHaveBeenCalled();
  });
});
