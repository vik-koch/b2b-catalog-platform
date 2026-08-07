import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RegisterRequest } from '@b2b-catalog-platform/shared';
import { COMPANY_ID_RULE, CompanyIdRule } from '../config/deployment-config';
import { env } from '../env';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailService } from '../mail/mail.service';
import { newRegistrationMail } from '../mail/templates/new-registration.template';
import { registrationReceivedMail } from '../mail/templates/registration-received.template';
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
    private readonly mail: MailService,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(COMPANY_ID_RULE) private readonly companyIdMatches: CompanyIdRule,
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
        message:
          'Company registration number does not match the configured format',
      });
    }

    const email = request.email.trim().toLowerCase();

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

    // A hash of a secret nobody holds — the account gets its real password when
    // staff approve it. See UsersService.createPending.
    const unusablePassword = await this.passwords.unusableHash();
    await this.users.createPending({
      email,
      passwordHash: unusablePassword,
      firstName: request.firstName.trim(),
      lastName: request.lastName.trim(),
      phone: request.phone.trim(),
      customerType: request.customerType,
      companyRegistrationId: request.companyRegistrationId ?? null,
    });

    await this.notify(email, request);
  }

  /**
   * The two mails a registration produces. Sent independently and never allowed
   * to fail the request: the account row is what matters, and staff can see and
   * approve it from the admin panel whether or not SMTP was reachable.
   */
  private async notify(email: string, request: RegisterRequest): Promise<void> {
    await this.send(
      () => this.mail.send(registrationReceivedMail(this.text), { to: email }),
      'registration confirmation',
    );

    const staffInbox = env.MAIL_STAFF_TO;
    if (!staffInbox) {
      // env.ts requires this in server mode; this narrows the type.
      throw new Error('MAIL_STAFF_TO is not configured');
    }
    await this.send(
      () =>
        this.mail.send(newRegistrationMail({ ...request, email }, this.text), {
          to: staffInbox,
        }),
      'staff notification',
    );
  }

  private async send(send: () => Promise<void>, what: string): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.error(`Could not send the ${what} mail`, error);
    }
  }
}
