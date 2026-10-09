import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  formatPhone,
  PhoneConfig,
  RegisterRequest,
} from '@b2b-catalog-platform/shared';
import { AddressesService } from '../addresses/addresses.service';
import { ConsentService } from '../consents/consent.service';
import {
  COMPANY_ID_RULE,
  CompanyIdRule,
  PHONE_INPUT,
  PHONE_RULE,
  PhoneRule,
} from '../config/deployment-config';
import { env } from '../env';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailDispatcher } from '../mail/mail-dispatcher';
import { newRegistrationMail } from '../mail/templates/new-registration.template';
import { registrationReceivedMail } from '../mail/templates/registration-received.template';
import { storedPhone } from '../users/stored-phone';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';

/**
 * Self-registration (FR-AUTH-01). The account is created `pending` and cannot
 * sign in until staff approve it and assign a tier (ADR 0032).
 *
 * Every path through `register` ends the same way — a plain success — because
 * the caller must not be able to tell a new address from one that already has
 * an account. What differs is what is written and what is mailed.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger('Registration');

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly mail: MailDispatcher,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(COMPANY_ID_RULE) private readonly companyIdMatches: CompanyIdRule,
    private readonly addresses: AddressesService,
    @Inject(PHONE_INPUT) private readonly phoneInput: PhoneConfig | undefined,
    private readonly consents: ConsentService,
    @Inject(PHONE_RULE) private readonly phoneRule: PhoneRule,
  ) {}

  async register(request: RegisterRequest): Promise<void> {
    // Honeypot: drop it silently toward the caller — no account, no mail, a
    // normal 200 with no hint the decoy tripped — but log it server-side so
    // hits stay visible for spam monitoring. The fact only, no address.
    if (request.website) {
      this.logger.warn('Rejected registration: honeypot field populated');
      return;
    }

    // The shared contract settles the envelope; the *format* of a registration
    // number is jurisdiction-specific deployment config, so it is checked here
    // as well as in the browser. A rejected format is a real 400: unlike an
    // address that already has an account, it reveals nothing about anyone.
    if (
      request.companyRegistrationId &&
      !this.companyIdMatches(request.companyRegistrationId)
    ) {
      throw new BadRequestException({
        code: 'company-id-format',
        message: 'Company ID does not match the configured format',
      });
    }

    // The same goes for the phone, read into the one form a code can be sent
    // to. Required by the contract, so a value always comes back.
    const phone = storedPhone(this.phoneRule, request.phone) ?? '';

    // Before the address is looked up, so a refusal says the same for a new
    // address and a known one.
    const consent = await this.consents.check(
      'account',
      request.consentVersion,
    );

    const email = request.email.trim().toLowerCase();

    // A hash of a secret nobody holds — the account gets its real password when
    // staff approve it. See UsersService.createPending. Computed before the
    // lookup, and for a known address too: the hash is nearly all of this
    // request's time, so skipping it would tell a known address by the clock.
    const unusablePassword = await this.passwords.unusableHash();

    const existing = await this.users.findByEmail(email);
    if (existing) {
      // Neither a second row nor a mail: re-registering must not tell the
      // sender that the address is taken, and must not let a stranger spam a
      // real customer's inbox by submitting their address repeatedly.
      this.logger.log(
        'Registration for an address that already has an account',
      );
      return;
    }

    const created = await this.users.createPending({
      email,
      passwordHash: unusablePassword,
      firstName: request.firstName.trim(),
      lastName: request.lastName.trim(),
      phone,
      customerType: request.customerType,
      companyName: request.companyName?.trim() ?? null,
      companyRegistrationId: request.companyRegistrationId ?? null,
    });

    if (consent) {
      await this.consents.record(consent, { userId: created.id, email });
    }
    await this.seedBillingAddress(created.id, request);
    await this.notify(email, { ...request, phone });
  }

  /**
   * The company's registered address as the account's first saved one
   * (FR-AUTH-10), where the registrant picked a suggestion that carried one.
   *
   * Two conditions, both from ADR 0041. It is only written for a **legal
   * entity** — an individual entrepreneur's registered address is their home,
   * and nobody asked us to store that. And it is only written when the parts an
   * address is actually made of arrived: a registry that answered a city and
   * nothing else has not given us an address, and a half row in the book would
   * be worse than none.
   */
  private async seedBillingAddress(
    userId: string,
    request: RegisterRequest,
  ): Promise<void> {
    const address = request.billingAddress;
    if (!address || address.entityType !== 'legal') return;

    if (
      !address.street ||
      !address.postalCode ||
      !address.city ||
      !address.country
    ) {
      return;
    }

    await this.addresses.seed(userId, {
      // Unlabelled on purpose: the customer never named it, and the book shows
      // an unnamed address by its own street.
      label: null,
      // Already the printed line, house number and all — the adapter composed
      // it, because where the number goes is regional typography.
      street: address.street,
      street2: address.unit ?? null,
      postalCode: address.postalCode,
      city: address.city,
      region: address.region ?? null,
      country: address.country,
    });
  }

  /**
   * The two mails a registration produces. Dispatched independently and never
   * allowed to fail or delay the request: the account row is what matters, and
   * staff can see and approve it from the admin panel whether or not SMTP was
   * reachable.
   */
  private async notify(email: string, request: RegisterRequest): Promise<void> {
    await this.mail.dispatch(
      registrationReceivedMail(this.text),
      { to: email },
      'registration confirmation',
    );

    const staffInbox = env.MAIL_STAFF_TO;
    if (!staffInbox) {
      // env.ts requires this in server mode; this narrows the type.
      throw new Error('MAIL_STAFF_TO is not configured');
    }
    await this.mail.dispatch(
      newRegistrationMail(
        {
          ...request,
          email,
          // Stored unmasked; a manager reading this on a phone gets it
          // grouped the way this deployment writes numbers.
          phone: formatPhone(request.phone, this.phoneInput),
        },
        this.text,
      ),
      { to: staffInbox },
      'staff notification',
    );
  }
}
