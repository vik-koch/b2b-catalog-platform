import { createHash } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import {
  ACCEPTED_CUSTOMER_TYPES,
  ALTERNATE_LAYOUT,
  COMPANY_ID_FORMATS,
  loadAcceptedCustomerTypes,
  loadAlternateLayout,
  loadCompanyIdFormats,
  loadPhoneInput,
  loadPhoneRule,
  loadSignInStep,
  PHONE_INPUT,
  PHONE_RULE,
} from '../../config/deployment-config';
import { env } from '../../env';
import { MailModule } from '../../mail/mail.module';
import { MailService } from '../../mail/mail.service';
import { MAIL_TEXT, MailText } from '../../mail/mail-text';
import { jwtSecret, SessionModule } from '../../platform/auth/session.module';
import { AccountDeletion } from './account-deletion';
import { AccountErasure } from './account-erasure';
import { AccountInvitations } from './account-invitations';
import { PasswordService } from './password.service';
import { PasswordPolicy } from './password-policy';
import { PasswordResetService } from './password-reset.service';
import { PasswordTokenService } from './password-token.service';
import { HttpCallCheck } from './sign-in-step/http-call-check';
import { HttpCodeDelivery } from './sign-in-step/http-code-delivery';
import { MailCallCheck } from './sign-in-step/mail-call-check';
import { MailCodeDelivery } from './sign-in-step/mail-code-delivery';
import { SignInCodes } from './sign-in-step/sign-in-codes';
import { SIGN_IN_PROOF, SignInProof } from './sign-in-step/sign-in-proof';
import {
  SIGN_IN_STEP_CONFIG,
  SIGN_IN_STEP_SECRET,
  SignInStep,
} from './sign-in-step/sign-in-step';
import { StaffUsersService } from './staff-users.service';
import { UsersService } from './users.service';

/**
 * How the step proves the number: the deployment's sidecar when it names one,
 * the account's mailbox otherwise. Which one is logged at boot, because only
 * a sidecar is a second factor.
 */
function signInProof(mail: MailService, text: MailText): SignInProof {
  const logger = new Logger('SignInStep');
  if (env.SIGN_IN_CALL_URL) {
    logger.log('Sign-in calls are checked through the call sidecar');
    return {
      kind: 'call',
      check: new HttpCallCheck(env.SIGN_IN_CALL_URL, env.SIGN_IN_CALL_TOKEN),
    };
  }
  if (env.SIGN_IN_CODE_URL) {
    logger.log('Sign-in codes are sent through the code sidecar');
    return {
      kind: 'code',
      delivery: new HttpCodeDelivery(
        env.SIGN_IN_CODE_URL,
        env.SIGN_IN_CODE_TOKEN,
      ),
    };
  }
  if (env.SIGN_IN_MAIL_KIND === 'call') {
    logger.log('Sign-in calls are stood in for by mail (no second factor)');
    return { kind: 'call', check: new MailCallCheck(mail, text) };
  }
  logger.log('Sign-in codes are sent by mail (no second factor)');
  return { kind: 'code', delivery: new MailCodeDelivery(mail, text) };
}

/** The pending sign-in's own key, derived from the session secret so that one
 * cannot be presented as the other. */
function signInStepSecret(): string {
  return createHash('sha256')
    .update(`sign-in-step:${jwtSecret()}`)
    .digest('hex');
}

/**
 * What the customer's own screens, the staff's account screens and the
 * customer exchange all act on an account through: passwords and their links,
 * the sign-in step, invitations and deletion. Re-exports the session and the
 * `users` table, so an accounts module needs only this one.
 */
@Module({
  // The erasure steps come from the app root (ACCOUNT_ERASURE_STEPS).
  imports: [SessionModule, MailModule],
  providers: [
    // The grouping the staff notification puts back on a stored number.
    { provide: PHONE_INPUT, useFactory: loadPhoneInput },
    // Every door that writes an account's number reads it by this rule.
    { provide: PHONE_RULE, useFactory: loadPhoneRule },
    // The shapes the staff list's "which kind of number" filter can name.
    { provide: COMPANY_ID_FORMATS, useFactory: loadCompanyIdFormats },
    { provide: ALTERNATE_LAYOUT, useFactory: loadAlternateLayout },
    {
      provide: ACCEPTED_CUSTOMER_TYPES,
      useFactory: loadAcceptedCustomerTypes,
    },
    { provide: SIGN_IN_STEP_CONFIG, useFactory: loadSignInStep },
    { provide: SIGN_IN_STEP_SECRET, useFactory: signInStepSecret },
    {
      provide: SIGN_IN_PROOF,
      useFactory: signInProof,
      inject: [MailService, MAIL_TEXT],
    },
    SignInCodes,
    SignInStep,
    PasswordService,
    PasswordTokenService,
    PasswordPolicy,
    PasswordResetService,
    StaffUsersService,
    AccountInvitations,
    UsersService,
    AccountErasure,
    AccountDeletion,
  ],
  exports: [
    SessionModule,
    UsersService,
    PHONE_INPUT,
    PHONE_RULE,
    ACCEPTED_CUSTOMER_TYPES,
    SIGN_IN_PROOF,
    SignInStep,
    PasswordService,
    PasswordTokenService,
    PasswordPolicy,
    PasswordResetService,
    StaffUsersService,
    AccountInvitations,
    AccountDeletion,
  ],
})
export class AccountsCoreModule {}
