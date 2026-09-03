import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  AUTH_COOKIE,
  PASSWORD_TOKEN_INVALID,
  SESSION_HINT_COOKIE,
} from '@b2b-catalog-platform/shared';
import { AuthController } from './auth.controller';
import { AuthService, WrongCurrentPasswordError } from './auth.service';
import { PasswordRejectedError } from './password-policy';
import { PasswordResetService } from './password-reset.service';
import { PasswordSetupService } from './password-setup.service';
import { RegistrationService } from './registration.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { MaintenanceGuard } from '../settings/maintenance.guard';
import { SettingsService } from '../settings/settings.service';
import { ContractErrorFilter } from '../orpc/contract-error.filter';

/**
 * The whole point of this surface is what it does *not* say, and what it puts
 * on the response beside the body — neither of which a handler-level test can
 * see. So: over a real server, with the real maintenance gate.
 */
describe('AuthController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let maintenanceOn = false;
  let signedInAs: { id: string; role: string } | null = null;

  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'jane@example.com',
    role: 'user' as const,
    firstName: 'Jane',
    mustChangePassword: false,
  };

  const auth = {
    validate: vi.fn(),
    signToken: vi.fn(async () => 'a-signed-token'),
    toAuthUser: vi.fn(() => user),
    changePassword: vi.fn(),
  };
  const registration = { register: vi.fn() };
  const passwordSetup = { describe: vi.fn(), redeem: vi.fn() };
  const passwordReset = { request: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: RegistrationService, useValue: registration },
        { provide: PasswordSetupService, useValue: passwordSetup },
        { provide: PasswordResetService, useValue: passwordReset },
        { provide: APP_FILTER, useClass: ContractErrorFilter },
        {
          provide: SettingsService,
          useValue: { isMaintenanceEnabled: () => maintenanceOn },
        },
        // The real gate, with only its admin-cookie check stubbed out: what is
        // under test is whether it still finds the route metadata.
        {
          provide: APP_GUARD,
          inject: [Reflector, SettingsService],
          useFactory: (reflector: Reflector, settings: SettingsService) =>
            new MaintenanceGuard(
              reflector,
              settings,
              { verifyAsync: async () => ({}) } as never,
              { findById: async () => null } as never,
            ),
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          // The coded body the real guard throws — the filter is what turns it
          // into the refusal the client reads, and a bare exception here would
          // quietly test something else.
          if (!signedInAs) {
            throw new UnauthorizedException({
              code: 'not-authenticated',
              message: 'Not authenticated',
            });
          }
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
    maintenanceOn = false;
    signedInAs = null;
    for (const fn of [
      ...Object.values(auth),
      registration.register,
      passwordSetup.describe,
      passwordSetup.redeem,
      passwordReset.request,
    ]) {
      fn.mockClear();
    }
    auth.signToken.mockResolvedValue('a-signed-token');
    auth.toAuthUser.mockReturnValue(user);
  });

  const post = (path: string, body?: unknown) =>
    fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const credentials = { email: 'jane@example.com', password: 'correct-horse' };

  const registration_ = {
    email: 'new@example.com',
    firstName: 'New',
    lastName: 'Customer',
    phone: '+49 30 123456',
    customerType: 'person' as const,
  };

  it('starts a session on a good password', async () => {
    auth.validate.mockResolvedValue({ ...user, role: 'user' });

    const response = await post('/auth/login', credentials);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain(`${AUTH_COOKIE}=a-signed-token`);
    // The readable hint beside the httpOnly cookie, so the first frame can
    // draw the account control without waiting for /auth/me.
    expect(cookies).toContain(`${SESSION_HINT_COOKIE}=user`);
  });

  // The form says the same thing to a wrong address, a wrong password and an
  // account that may not sign in — so this endpoint cannot become a way to
  // test which addresses have accounts.
  it('gives one answer, and no cookie, to every bad sign-in', async () => {
    auth.validate.mockResolvedValue(null);

    const response = await post('/auth/login', credentials);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'invalid-credentials',
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  // Somebody locked out while the storefront is down still needs the way back
  // in, and the exemption is metadata the gate reads off the handler.
  it('still lets somebody sign in while maintenance is on', async () => {
    maintenanceOn = true;
    auth.validate.mockResolvedValue({ ...user, role: 'admin' });

    const response = await post('/auth/login', credentials);

    expect(response.status).toBe(200);
  });

  // Registration is not exempt: while the storefront is down there is nothing
  // to register for.
  it('closes registration while maintenance is on', async () => {
    maintenanceOn = true;

    const response = await post('/auth/register', registration_);

    expect(response.status).toBe(503);
    expect(registration.register).not.toHaveBeenCalled();
  });

  it('answers a registration the same way whatever the address was', async () => {
    registration.register.mockResolvedValue(undefined);

    const response = await post('/auth/register', registration_);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('names the rule that refused a new password', async () => {
    passwordSetup.redeem.mockRejectedValue(
      new PasswordRejectedError('password-common', 'Too common'),
    );

    const response = await post('/auth/set-password', {
      token: 'a-token',
      password: 'a-long-enough-password',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'password-common',
    });
  });

  it('answers a spent link with the one code it has for all of them', async () => {
    passwordSetup.redeem.mockResolvedValue(null);

    const response = await post('/auth/set-password', {
      token: 'a-token',
      password: 'a-long-enough-password',
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: PASSWORD_TOKEN_INVALID,
    });
  });

  // Two 400s the form has to tell apart: retype the field above, versus the
  // new password was refused and here is which rule did it.
  it('tells a wrong current password from a refused new one', async () => {
    signedInAs = { id: user.id, role: 'user' };
    const body = {
      currentPassword: 'old-one',
      newPassword: 'a-long-enough-password',
    };

    auth.changePassword.mockRejectedValueOnce(
      new WrongCurrentPasswordError('Current password is incorrect'),
    );
    const wrongCurrent = await post('/auth/change-password', body);

    auth.changePassword.mockRejectedValueOnce(
      new PasswordRejectedError('password-contains-email', 'Contains email'),
    );
    const refused = await post('/auth/change-password', body);

    expect(wrongCurrent.status).toBe(400);
    expect(await wrongCurrent.json()).toMatchObject({
      code: 'wrong-current-password',
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      code: 'password-contains-email',
    });
  });

  // The client sends no body at all now; the route must not require one.
  it('clears the session on a logout with no body', async () => {
    const response = await post('/auth/logout');

    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain(`${AUTH_COOKIE}=`);
    expect(cookies).toContain(`${SESSION_HINT_COOKIE}=`);
  });

  it('answers /auth/me with the session’s own identity', async () => {
    signedInAs = { ...user };

    const response = await fetch(`${baseUrl}/api/auth/me`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
  });

  it('refuses /auth/me to nobody', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'not-authenticated',
    });
  });
});
