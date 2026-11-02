import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { SharedText } from '@b2b-catalog-platform/shared';
import { AddressesService } from '../../core/accounts/addresses.service';
import { ConsentService } from '../../core/site/consent.service';
import {
  ACCEPTED_CUSTOMER_TYPES,
  COMPANY_ID_RULE,
  CompanyIdRule,
  PHONE_INPUT,
  PHONE_RULE,
  PhoneRule,
} from '../../config/deployment-config';
import { env } from '../../env';
import { MAIL_TEXT, MailText } from '../../mail/mail-text';
import { SHARED_TEXT } from '../../config/shared-text';
import { MailDispatcher } from '../../mail/mail-dispatcher';
import { newRegistrationMail } from '../../mail/templates/new-registration.template';
import { registrationReceivedMail } from '../../mail/templates/registration-received.template';
import { storedPhone } from '../../core/accounts/stored-phone';
import { UsersService } from '../../core/accounts/users.service';
import { PasswordService } from '../../core/accounts/password.service';
import {
  CustomerType,
  RegisterRequest,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  formatPhone,
  PhoneConfig,
} from '@b2b-catalog-platform/shared/platform';

/**
 * Self-registration (FR-AUTH-01): a `pending` account until staff approve it.
 * Every path ends in the same plain success, so a caller cannot tell a new
 * address from a known one; only what is written and mailed differs.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger('Registration');

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly mail: MailDispatcher,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(SHARED_TEXT) private readonly common: SharedText,
    @Inject(COMPANY_ID_RULE) private readonly companyIdMatches: CompanyIdRule,
    private readonly addresses: AddressesService,
    @Inject(PHONE_INPUT) private readonly phoneInput: PhoneConfig | undefined,
    private readonly consents: ConsentService,
    @Inject(PHONE_RULE) private readonly phoneRule: PhoneRule,
    @Inject(ACCEPTED_CUSTOMER_TYPES)
    private readonly customerTypes: readonly CustomerType[],
  ) {}

  async register(request: RegisterRequest): Promise<void> {
    // A honeypot hit: silent to the caller, logged without the address.
    if (request.website) {
      this.logger.warn('Rejected registration: honeypot field populated');
      return;
    }

    // FR-AUTH-13: the form offers only these; this is the rule.
    if (!this.customerTypes.includes(request.customerType)) {
      throw new BadRequestException({
        code: 'customer-type-not-accepted',
        message: 'This shop does not sell to that kind of customer',
      });
    }

    // A real refusal: unlike a known address, a format reveals nothing.
    if (
      request.companyRegistrationId &&
      !this.companyIdMatches(request.companyRegistrationId)
    ) {
      throw new BadRequestException({
        code: 'company-id-format',
        message: 'Company ID does not match the configured format',
      });
    }

    // Required by the contract, so a value always comes back.
    const phone = storedPhone(this.phoneRule, request.phone) ?? '';

    // Before the lookup, so a refusal is the same for a known address.
    const consent = await this.consents.check(
      'account',
      request.consentVersion,
    );

    const email = request.email.trim().toLowerCase();

    // For a known address too: the hash is nearly all of this request's
    // time, so skipping it would tell a known address by the clock.
    const unusablePassword = await this.passwords.unusableHash();

    const existing = await this.users.findByEmail(email);
    if (existing) {
      // No mail either: a stranger must not spam a customer's inbox.
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
   * The picked company's registered address as the first saved one
   * (FR-AUTH-10). Only for a legal entity, since a sole trader's is their
   * home, and only whole: half an address is worse than none.
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
      label: null,
      // The adapter's printed line: where the number goes is regional.
      street: address.street,
      street2: address.unit ?? null,
      postalCode: address.postalCode,
      city: address.city,
      region: address.region ?? null,
      country: address.country,
    });
  }

  /** Queued, so neither can fail the request: staff see the account
   * either way. */
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
          // Grouped the way this deployment writes numbers.
          phone: formatPhone(request.phone, this.phoneInput),
        },
        this.text,
        this.common,
      ),
      { to: staffInbox },
      'staff notification',
    );
  }
}
