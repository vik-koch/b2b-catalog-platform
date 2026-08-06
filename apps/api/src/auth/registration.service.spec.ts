import { Test } from '@nestjs/testing';
import { MAIL_TEXT } from '../mail/mail-text';
import { demoMailText } from '../mail/mail-text.fixture';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';

/**
 * The rule this service exists to keep: a caller can never tell from the
 * outside whether an address already has an account. Every test here is a
 * variation on "what was written, and what was mailed" — the answer to the
 * caller is always the same.
 */
describe('RegistrationService', () => {
  const findByEmail = jest.fn();
  const createPending = jest.fn();
  const send = jest.fn<Promise<void>, [unknown, { to: string }]>();
  let service: RegistrationService;

  beforeEach(async () => {
    findByEmail.mockReset().mockResolvedValue(undefined);
    createPending.mockReset().mockResolvedValue({ id: 'new-id' });
    send.mockReset().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: UsersService, useValue: { findByEmail, createPending } },
        { provide: MailService, useValue: { send } },
        { provide: MAIL_TEXT, useValue: demoMailText },
        {
          provide: PasswordService,
          useValue: {
            hash: jest.fn().mockResolvedValue('$argon2id$generated'),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RegistrationService);
  });

  const recipients = () => send.mock.calls.map(([, envelope]) => envelope.to);

  it('creates a pending account and mails the registrant and the shop', async () => {
    await service.register({ email: 'jane@example.com' });

    expect(createPending).toHaveBeenCalledWith(
      'jane@example.com',
      '$argon2id$generated',
    );
    expect(recipients()).toEqual([
      'jane@example.com',
      process.env['MAIL_STAFF_TO'],
    ]);
  });

  it('stores the address lowercased, so it matches the login lookup', async () => {
    await service.register({ email: '  Jane@Example.COM ' });

    expect(createPending).toHaveBeenCalledWith(
      'jane@example.com',
      expect.any(String),
    );
  });

  it('writes nothing and mails nobody when the honeypot is filled', async () => {
    await expect(
      service.register({
        email: 'bot@example.com',
        website: 'http://spam.example',
      }),
    ).resolves.toBeUndefined();

    expect(findByEmail).not.toHaveBeenCalled();
    expect(createPending).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('treats a blank honeypot as absent and still registers', async () => {
    await service.register({ email: 'jane@example.com', website: '' });

    expect(createPending).toHaveBeenCalled();
  });

  // Re-registering must not create a second row, must not tell the sender the
  // address is taken, and must not let a stranger mail-bomb a real customer.
  it('does nothing at all for an address that already has an account', async () => {
    findByEmail.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({ email: 'jane@example.com' }),
    ).resolves.toBeUndefined();

    expect(createPending).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  // The account row is what matters: staff can approve it from the panel
  // whether or not SMTP was reachable when it was created.
  it('keeps the account when a mail fails, and still sends the other one', async () => {
    send.mockRejectedValueOnce(new Error('smtp down'));

    await expect(
      service.register({ email: 'jane@example.com' }),
    ).resolves.toBeUndefined();

    expect(createPending).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
