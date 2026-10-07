import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import {
  normalizePhone,
  PhoneConfig,
  SignInStepConfig,
} from '@b2b-catalog-platform/shared';
import { UserRow, UsersService } from '../../users/users.service';
import { CodeDeliveryError } from './code-delivery';
import { SignInCodes } from './sign-in-codes';
import {
  maskEmail,
  maskPhone,
  PENDING_COOKIE,
  SignInStep,
} from './sign-in-step';

const phoneInput: PhoneConfig = { countryCode: '+49', mask: '(###) ###-####' };
const SECRET = 'a-secret-only-the-step-uses-0123456789';

const customer = {
  id: 'user-1',
  email: 'jane@example.com',
  role: 'user',
  status: 'active',
  tokenVersion: 3,
  phone: '+494012345678',
  phoneConfirmedAt: new Date('2026-10-01T00:00:00Z'),
} as UserRow;

describe('SignInStep', () => {
  const codes = {
    issue: vi.fn(),
    resend: vi.fn(),
    check: vi.fn(),
  };
  const users = { findById: vi.fn(), confirmPhone: vi.fn() };
  const jwt = new JwtService({});
  const cookies: Record<string, string> = {};
  const res = {
    cookie: (name: string, value: string) => {
      cookies[name] = value;
    },
    clearCookie: (name: string) => {
      delete cookies[name];
    },
  } as unknown as Response;
  const req = { secure: false, cookies } as unknown as Request;

  const step = (config: SignInStepConfig | undefined) =>
    new SignInStep(
      config,
      SECRET,
      (value) => normalizePhone(value, phoneInput),
      phoneInput,
      jwt,
      codes as unknown as SignInCodes,
      users as unknown as UsersService,
      { channel: 'sms', send: vi.fn() },
    );
  const always = step({ mode: 'always', roles: ['user'] });

  beforeEach(() => {
    for (const fn of [...Object.values(codes), ...Object.values(users)]) {
      fn.mockReset();
    }
    for (const name of Object.keys(cookies)) delete cookies[name];
    codes.issue.mockImplementation(async (_user, phone: string) => ({
      phone,
      resendInMs: 60_000,
    }));
  });

  describe('what a sign-in owes', () => {
    const unconfirmed = { ...customer, phoneConfirmedAt: null } as UserRow;

    it.each([
      ['no config', undefined, customer, 'none'],
      ['off', { mode: 'off', roles: ['user'] }, unconfirmed, 'none'],
      [
        'a role not listed',
        { mode: 'always', roles: ['admin'] },
        customer,
        'none',
      ],
      [
        'always, confirmed',
        { mode: 'always', roles: ['user'] },
        customer,
        'code',
      ],
      [
        'always, unconfirmed',
        { mode: 'always', roles: ['user'] },
        unconfirmed,
        'confirm',
      ],
      ['once, confirmed', { mode: 'once', roles: ['user'] }, customer, 'none'],
      [
        'once, unconfirmed',
        { mode: 'once', roles: ['user'] },
        unconfirmed,
        'confirm',
      ],
      [
        'a confirmation without a number',
        { mode: 'once', roles: ['user'] },
        { ...customer, phone: null },
        'confirm',
      ],
    ] as const)('%s', (_, config, user, need) => {
      expect(step(config as SignInStepConfig | undefined).need(user)).toBe(
        need,
      );
    });
  });

  describe('an exemption', () => {
    const exempted = {
      ...customer,
      role: 'admin',
      signInStepExemptAt: new Date('2026-10-07T00:00:00Z'),
    } as UserRow;

    it('lets the account sign in with the password alone', () => {
      const config = {
        mode: 'always',
        roles: ['user', 'admin'],
        exemptableRoles: ['admin'],
      } as const;

      expect(step(config).need(exempted)).toBe('none');
      expect(step(config).asks(exempted)).toBe(false);
    });

    // Narrowing the list ends every exemption at once, without the rows.
    it('counts for nothing once the role may no longer be exempted', () => {
      const config = { mode: 'always', roles: ['user', 'admin'] } as const;

      expect(step(config).need(exempted)).toBe('code');
    });

    it('is allowed only for a role the deployment both asks and lists', () => {
      const config = {
        mode: 'always',
        roles: ['admin'],
        exemptableRoles: ['admin', 'user'],
      } as const;

      expect(step(config).mayExempt('admin')).toBe(true);
      // Listed, but never asked: there is nothing to exempt it from.
      expect(step(config).mayExempt('user')).toBe(false);
      expect(step({ ...config, mode: 'off' }).mayExempt('admin')).toBe(false);
    });
  });

  it('starts no step where none is owed, and sets no cookie', async () => {
    const off = step({ mode: 'off', roles: ['user'] });

    expect(await off.begin(customer, req, res)).toBeNull();
    expect(codes.issue).not.toHaveBeenCalled();
    expect(cookies[PENDING_COOKIE]).toBeUndefined();
  });

  it('sends a code to the confirmed number and answers it masked', async () => {
    const answer = await always.begin(customer, req, res);

    expect(codes.issue).toHaveBeenCalledWith(
      customer,
      '+494012345678',
      'sign-in',
    );
    expect(answer).toEqual({
      step: 'code',
      sentTo: '+49 (•••) •••-••78',
      phone: '+49 (•••) •••-••78',
      confirming: false,
      resendIn: 60,
    });
    expect(cookies[PENDING_COOKIE]).toBeTruthy();
  });

  it('confirms the account’s own number first, where a code can reach it', async () => {
    const user = { ...customer, phoneConfirmedAt: null } as UserRow;

    const answer = await always.begin(user, req, res);

    expect(codes.issue).toHaveBeenCalledWith(user, '+494012345678', 'confirm');
    expect(answer).toMatchObject({ step: 'code', confirming: true });
  });

  // Nobody chooses a number at sign-in: the holder asks the shop.
  it('stops where the stored number cannot take a code', async () => {
    const user = {
      ...customer,
      phone: '+49 40 1234567',
      phoneConfirmedAt: null,
    } as UserRow;

    await expect(always.begin(user, req, res)).rejects.toMatchObject({
      reason: 'unreachable',
    });
    expect(codes.issue).not.toHaveBeenCalled();
    expect(cookies[PENDING_COOKIE]).toBeUndefined();
  });

  it('stops where the provider refuses the stored number', async () => {
    codes.issue.mockRejectedValue(new CodeDeliveryError('unreachable', 'no'));
    const user = { ...customer, phoneConfirmedAt: null } as UserRow;

    await expect(always.begin(user, req, res)).rejects.toMatchObject({
      reason: 'unreachable',
    });
  });

  it('stops when the provider is unavailable: nothing skips the step', async () => {
    codes.issue.mockRejectedValue(new CodeDeliveryError('unavailable', 'down'));

    await expect(always.begin(customer, req, res)).rejects.toThrow(
      CodeDeliveryError,
    );
    expect(cookies[PENDING_COOKIE]).toBeUndefined();
  });

  // Dev and the demo mail their codes: the screen has to say where they went.
  it('names the mailbox where codes are delivered by mail', async () => {
    const byMail = new SignInStep(
      { mode: 'always', roles: ['user'] },
      SECRET,
      (value) => normalizePhone(value, phoneInput),
      phoneInput,
      jwt,
      codes as unknown as SignInCodes,
      users as unknown as UsersService,
      { channel: 'email', send: vi.fn() },
    );

    expect(await byMail.begin(customer, req, res)).toMatchObject({
      sentTo: 'j•••@example.com',
      phone: '+49 (•••) •••-••78',
    });
  });

  describe('the pending sign-in', () => {
    it('names the account it was started for', async () => {
      await always.begin(customer, req, res);
      users.findById.mockResolvedValue(customer);

      expect(await always.pending(req)).toBe(customer);
    });

    it('ends when the password changed meanwhile', async () => {
      await always.begin(customer, req, res);
      users.findById.mockResolvedValue({ ...customer, tokenVersion: 4 });

      expect(await always.pending(req)).toBeNull();
    });

    it('ends when the account stopped being active', async () => {
      await always.begin(customer, req, res);
      users.findById.mockResolvedValue({ ...customer, status: 'disabled' });

      expect(await always.pending(req)).toBeNull();
    });

    // Signed with the session secret, a session token would otherwise pass.
    it('is not a token signed with another secret', async () => {
      cookies[PENDING_COOKIE] = await jwt.signAsync(
        { sub: customer.id, tokenVersion: customer.tokenVersion },
        { secret: 'the-session-secret-0123456789abcdef' },
      );
      users.findById.mockResolvedValue(customer);

      expect(await always.pending(req)).toBeNull();
    });
  });

  it('writes a confirmed number to the account', async () => {
    codes.check.mockResolvedValue({
      result: 'ok',
      purpose: 'confirm',
      phone: '+494076543210',
    });
    const confirmed = { ...customer, phone: '+494076543210' };
    users.confirmPhone.mockResolvedValue(confirmed);

    expect(await always.complete(customer, '123456')).toEqual({
      result: 'ok',
      user: confirmed,
    });
    expect(users.confirmPhone).toHaveBeenCalledWith('user-1', '+494076543210');
  });

  it('leaves the account alone after a sign-in code', async () => {
    codes.check.mockResolvedValue({
      result: 'ok',
      purpose: 'sign-in',
      phone: customer.phone,
    });

    expect(await always.complete(customer, '123456')).toEqual({
      result: 'ok',
      user: customer,
    });
    expect(users.confirmPhone).not.toHaveBeenCalled();
  });
});

describe('maskPhone', () => {
  it('keeps the country code, the grouping and the last two digits', () => {
    expect(maskPhone('+49 (401) 234-5678')).toBe('+49 (•••) •••-••78');
  });

  it('masks an ungrouped number the same way', () => {
    expect(maskPhone('+494012345678')).toBe('+••••••••••78');
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('jane@example.com')).toBe('j•••@example.com');
  });
});
