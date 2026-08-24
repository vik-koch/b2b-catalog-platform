import { Test } from '@nestjs/testing';
import { RegisterRequest } from '@b2b-catalog-platform/shared';
import { AddressesService } from '../addresses/addresses.service';
import { COMPANY_ID_RULE, PHONE_INPUT } from '../config/deployment-config';
import { MAIL_TEXT } from '../mail/mail-text';
import { demoMailText, demoPhoneInput } from '../mail/mail-text.fixture';
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
  const seed = jest.fn();
  const send = jest.fn<Promise<void>, [unknown, { to: string }]>();
  let service: RegistrationService;

  // The demo deployment's rule: a German VAT number (see config/deployment.json).
  const companyIdMatches = (value: string) => /^DE\d{9}$/.test(value);

  const person: RegisterRequest = {
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+494012345678',
    customerType: 'person',
  };
  const company: RegisterRequest = {
    ...person,
    customerType: 'company',
    companyName: 'Kontor GmbH',
    companyRegistrationId: 'DE123456789',
  };

  beforeEach(async () => {
    findByEmail.mockReset().mockResolvedValue(undefined);
    createPending.mockReset().mockResolvedValue({ id: 'new-id' });
    seed.mockReset();
    send.mockReset().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: UsersService, useValue: { findByEmail, createPending } },
        { provide: MailService, useValue: { send } },
        { provide: MAIL_TEXT, useValue: demoMailText },
        { provide: COMPANY_ID_RULE, useValue: companyIdMatches },
        { provide: AddressesService, useValue: { seed } },
        { provide: PHONE_INPUT, useValue: demoPhoneInput },
        {
          provide: PasswordService,
          useValue: {
            unusableHash: jest.fn().mockResolvedValue('$argon2id$generated'),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RegistrationService);
  });

  const recipients = () => send.mock.calls.map(([, envelope]) => envelope.to);

  it('creates a pending account and mails the registrant and the shop', async () => {
    await service.register(person);

    expect(createPending).toHaveBeenCalledWith({
      email: 'jane@example.com',
      passwordHash: '$argon2id$generated',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+494012345678',
      customerType: 'person',
      companyName: null,
      companyRegistrationId: null,
    });
    expect(recipients()).toEqual([
      'jane@example.com',
      process.env['MAIL_STAFF_TO'],
    ]);
  });

  /**
   * The number is stored unmasked, but the staff notification is read by a
   * person — often on a phone, deciding whether to approve — so it goes out
   * grouped the way this deployment writes numbers.
   */
  it('groups the phone number in the notification to the shop', async () => {
    await service.register(person);

    const [staffMail] = send.mock.calls[1] as unknown as [
      { rows?: { label: string; value: string }[] },
    ];
    expect(staffMail.rows).toContainEqual({
      label: demoMailText.newRegistration.phoneLabel,
      value: '+49 (401) 234-5678',
    });
  });

  it('stores a company ID that matches the deployment rule', async () => {
    await service.register(company);

    // Both halves of the invoiced party: the name staff match against their own
    // records, the number they can check it against.
    expect(createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        customerType: 'company',
        companyName: 'Kontor GmbH',
        companyRegistrationId: 'DE123456789',
      }),
    );
  });

  // The contract cannot know a jurisdiction's format, so the deployment's own
  // pattern is applied here too — a client-side-only rule is not a rule.
  it('refuses a number the deployment pattern rejects, and writes nothing', async () => {
    await expect(
      service.register({ ...company, companyRegistrationId: 'DE12345' }),
    ).rejects.toThrow(/company ID/i);

    expect(createPending).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('stores the address lowercased, so it matches the login lookup', async () => {
    await service.register({ ...person, email: '  Jane@Example.COM ' });

    expect(createPending).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com' }),
    );
  });

  it('writes nothing and mails nobody when the honeypot is filled', async () => {
    await expect(
      service.register({ ...person, website: 'http://spam.example' }),
    ).resolves.toBeUndefined();

    expect(findByEmail).not.toHaveBeenCalled();
    expect(createPending).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('treats a blank honeypot as absent and still registers', async () => {
    await service.register({ ...person, website: '' });

    expect(createPending).toHaveBeenCalled();
  });

  // Re-registering must not create a second row, must not tell the sender the
  // address is taken, and must not let a stranger mail-bomb a real customer.
  it('does nothing at all for an address that already has an account', async () => {
    findByEmail.mockResolvedValue({ id: 'existing' });

    await expect(service.register(person)).resolves.toBeUndefined();

    expect(createPending).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  // The account row is what matters: staff can approve it from the panel
  // whether or not SMTP was reachable when it was created.
  it('keeps the account when a mail fails, and still sends the other one', async () => {
    send.mockRejectedValueOnce(new Error('smtp down'));

    await expect(service.register(person)).resolves.toBeUndefined();

    expect(createPending).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
  });

  describe('the first address (FR-AUTH-10)', () => {
    // The street line as the adapter composed it — house number included, in
    // the shape its own jurisdiction prints.
    const registered = {
      entityType: 'legal' as const,
      street: 'Hafenstraße 12',
      postalCode: '20359',
      city: 'Hamburg',
      country: 'DE',
    };

    it('seeds the registered address of the company that was picked', async () => {
      await service.register({ ...company, billingAddress: registered });

      expect(seed).toHaveBeenCalledWith(
        'new-id',
        expect.objectContaining({
          // Unlabelled: the customer never named it, and the book shows an
          // unnamed address by its own street.
          label: null,
          street: 'Hafenstraße 12',
          postalCode: '20359',
          city: 'Hamburg',
          country: 'DE',
          // The invoiced party is what the *account* says, not a second copy
          // of what the registry said.
          companyName: 'Kontor GmbH',
          companyId: 'DE123456789',
        }),
      );
    });

    // An individual entrepreneur's registered address is their home. The rule
    // is applied here rather than trusted to the form.
    it('seeds nothing for an individual', async () => {
      await service.register({
        ...company,
        billingAddress: { ...registered, entityType: 'individual' },
      });

      expect(seed).not.toHaveBeenCalled();
    });

    // A registry that answered a city and nothing else has not given us an
    // address, and half a row in the book is worse than none.
    it.each(['street', 'postalCode', 'city', 'country'] as const)(
      'seeds nothing when the answer has no %s',
      async (missing) => {
        await service.register({
          ...company,
          billingAddress: { ...registered, [missing]: undefined },
        });

        expect(seed).not.toHaveBeenCalled();
      },
    );

    it('registers as usual when no company was picked', async () => {
      await service.register(company);

      expect(createPending).toHaveBeenCalled();
      expect(seed).not.toHaveBeenCalled();
    });
  });
});
