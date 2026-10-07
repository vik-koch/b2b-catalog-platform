import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccountController } from './account.controller';
import { AccountDeletion } from './account-deletion';
import { AuditLogger } from '../audit/audit.logger';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AUTH_COOKIE } from '../auth/auth.constants';
import {
  normalizePhone,
  SESSION_HINT_COOKIE,
} from '@b2b-catalog-platform/shared';
import { PHONE_RULE } from '../config/deployment-config';
import { SignInStep } from '../auth/sign-in-step/sign-in-step';

/**
 * Over a real server: the refusals here are the ones a form acts on, so what
 * matters is the shape they arrive in, and deleting an account also has to
 * reach past the contract layer to the response itself to clear the cookies.
 */
describe('AccountController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let signedInAs: { id: string; role: string } | null = null;

  const findById = vi.fn();
  const updateOwnProfile = vi.fn();
  const countOpenOrders = vi.fn();
  const deleteAccount = vi.fn();
  const record = vi.fn();
  /** Whether the deployment asks this account for a code (FR-AUTH-12). */
  let asks = false;
  const step = { asks: () => asks };

  const row = {
    id: 'user-1',
    email: 'jane@example.com',
    role: 'user' as const,
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+49 30 123456',
    customerType: 'company' as const,
    companyName: 'Kontor GmbH',
    companyRegistrationId: 'DE123',
    createdAt: new Date('2026-01-05T09:00:00.000Z'),
  };

  const profile = {
    email: row.email,
    role: row.role,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    customerType: row.customerType,
    companyName: row.companyName,
    companyRegistrationId: row.companyRegistrationId,
    createdAt: '2026-01-05T09:00:00.000Z',
    openOrders: 0,
    phoneLocked: false,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        {
          provide: UsersService,
          useValue: { findById, updateOwnProfile, countOpenOrders },
        },
        { provide: AccountDeletion, useValue: { delete: deleteAccount } },
        { provide: AuditLogger, useValue: { record } },
        { provide: SignInStep, useValue: step },
        {
          provide: PHONE_RULE,
          useValue: (value: string) =>
            normalizePhone(value, {
              countryCode: '+49',
              mask: '(###) ###-####',
            }),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          if (!signedInAs) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = signedInAs;
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
    signedInAs = { id: 'user-1', role: 'user' };
    findById.mockReset();
    updateOwnProfile.mockReset();
    countOpenOrders.mockReset();
    countOpenOrders.mockResolvedValue(0);
    deleteAccount.mockReset();
    record.mockReset();
    asks = false;
  });

  const del = (password: string) =>
    fetch(`${baseUrl}/api/account/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

  it('answers the profile of whoever the session says, never a requested id', async () => {
    findById.mockResolvedValue(row);

    const response = await fetch(`${baseUrl}/api/account/profile`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(profile);
    expect(findById).toHaveBeenCalledWith('user-1');
  });

  // The pricing group is staff's to assign and not the holder's to see
  // (ADR 0031). The output schema is what keeps it off the wire.
  it('never sends the tier, whatever the row carries', async () => {
    findById.mockResolvedValue({ ...row, tierId: 'tier-wholesale' });

    const body = await (await fetch(`${baseUrl}/api/account/profile`)).json();

    expect(body).toEqual(profile);
    expect(body).not.toHaveProperty('tierId');
  });

  // The account deleted itself between the guard and the read.
  it('answers 401 when the row has gone underneath the session', async () => {
    findById.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/account/profile`);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'not-authenticated',
    });
  });

  it('records its own audit action for a self-service correction', async () => {
    findById.mockResolvedValue(row);
    updateOwnProfile.mockResolvedValue(row);

    const response = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledWith('account.updated', signedInAs, {
      id: 'user-1',
    });
  });

  const patchPhone = (phone: string | null) =>
    fetch(`${baseUrl}/api/account/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Jane', lastName: 'Doe', phone }),
    });

  it('stores a changed number in the canonical form', async () => {
    findById.mockResolvedValue(row);
    updateOwnProfile.mockResolvedValue(row);

    const response = await patchPhone('+49 (401) 234-5678');

    expect(response.status).toBe(200);
    expect(updateOwnProfile).toHaveBeenCalledWith('user-1', {
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+494012345678',
    });
  });

  it('sends a number the rule cannot read back as a code', async () => {
    findById.mockResolvedValue(row);

    const response = await patchPhone('+7 914 123-45-67');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'phone-format' });
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  // The fixture's number does not fill the demo mask: one from before the
  // rule, which a name correction must not be refused over.
  it('keeps a stored number that comes back unchanged', async () => {
    findById.mockResolvedValue(row);
    updateOwnProfile.mockResolvedValue(row);

    const response = await patchPhone(row.phone);

    expect(response.status).toBe(200);
    expect(updateOwnProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ phone: row.phone }),
    );
  });

  describe('a number that receives sign-in codes (FR-AUTH-12)', () => {
    it('is locked on the profile', async () => {
      asks = true;
      findById.mockResolvedValue(row);

      const body = await (await fetch(`${baseUrl}/api/account/profile`)).json();

      expect(body.phoneLocked).toBe(true);
    });

    it('is refused when the holder changes it', async () => {
      asks = true;
      findById.mockResolvedValue(row);

      const response = await patchPhone('+49 (401) 234-5678');

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'phone-locked' });
      expect(updateOwnProfile).not.toHaveBeenCalled();
    });

    it('still lets the names be saved beside it', async () => {
      asks = true;
      findById.mockResolvedValue(row);
      updateOwnProfile.mockResolvedValue(row);

      expect((await patchPhone(row.phone)).status).toBe(200);
    });
  });

  // strict: it is what stops `role`, `tierId` or `status` riding along on a
  // self-service write (NFR-SEC-05).
  it('rejects a profile write carrying a field it may not set', async () => {
    const response = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: null,
        role: 'admin',
      }),
    });

    expect(response.status).toBe(400);
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it('sends the mistyped password back as a code the form can act on', async () => {
    deleteAccount.mockResolvedValue({ ok: false, reason: 'wrong-password' });

    const response = await del('nope');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'wrong-current-password',
    });
  });

  it('sends the last admin back as its own code, not as a fault', async () => {
    deleteAccount.mockResolvedValue({ ok: false, reason: 'last-admin' });

    const response = await del('correct-horse');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'last-admin' });
  });

  // The handler reaches the response object itself to clear the cookies, which
  // it can only do if Nest's `@Res({ passthrough: true })` still resolves
  // alongside the contract layer's own handling.
  it('clears both session cookies on a successful deletion', async () => {
    deleteAccount.mockResolvedValue({ ok: true });

    const response = await del('correct-horse');

    expect(response.status).toBe(200);
    const cleared = response.headers.getSetCookie().join('\n');
    expect(cleared).toContain(`${AUTH_COOKIE}=`);
    expect(cleared).toContain(`${SESSION_HINT_COOKIE}=`);
    expect(record).toHaveBeenCalledWith('account.deleted', signedInAs, {
      id: 'user-1',
    });
  });
});
