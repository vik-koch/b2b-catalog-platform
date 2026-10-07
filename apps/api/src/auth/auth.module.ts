import { createHash } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConsentModule } from '../consents/consent.module';
import {
  COMPANY_ID_RULE,
  loadCompanyIdRule,
  loadPhoneInput,
  loadPhoneRule,
  loadSignInStep,
  PHONE_INPUT,
  PHONE_RULE,
} from '../config/deployment-config';
import { env } from '../env';
import { MailModule } from '../mail/mail.module';
import { MailService } from '../mail/mail.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { AddressBookModule } from '../addresses/address-book.module';
import { UsersModule } from '../users/users.module';
import { SettingsStateModule } from '../settings/settings-state.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalAuthGuard } from './optional-auth.guard';
import { PasswordService } from './password.service';
import { PasswordTokenService } from './password-token.service';
import { PasswordPolicy } from './password-policy';
import { PasswordResetService } from './password-reset.service';
import { PasswordSetupService } from './password-setup.service';
import { RolesGuard } from './roles.guard';
import { SessionVaryingInterceptor } from './session-varying.interceptor';
import { CODE_DELIVERY, CodeDelivery } from './sign-in-step/code-delivery';
import { HttpCodeDelivery } from './sign-in-step/http-code-delivery';
import { MailCodeDelivery } from './sign-in-step/mail-code-delivery';
import { SignInCodes } from './sign-in-step/sign-in-codes';
import {
  SIGN_IN_STEP_CONFIG,
  SIGN_IN_STEP_SECRET,
  SignInStep,
} from './sign-in-step/sign-in-step';

// env.ts requires JWT_SECRET in server mode; this narrows the optional type and
// fails fast if the module is ever instantiated without it. Called from a
// factory, never at module-evaluation time: main.ts imports AppModule
// unconditionally, and the one-shot RUN_MODEs (migrate, seed, bootstrap-admin)
// exit before Nest boots — they have no session to sign and are given no secret.
function jwtSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return env.JWT_SECRET;
}

/**
 * Where sign-in codes go: the deployment's sidecar when it names one, the
 * account's mailbox otherwise. Which one is logged at boot, because only the
 * first is a second factor.
 */
function codeDelivery(mail: MailService, text: MailText): CodeDelivery {
  const logger = new Logger('SignInStep');
  if (env.SIGN_IN_CODE_URL) {
    logger.log('Sign-in codes are sent through the code sidecar');
    return new HttpCodeDelivery(env.SIGN_IN_CODE_URL, env.SIGN_IN_CODE_TOKEN);
  }
  logger.log('Sign-in codes are sent by mail (no second factor)');
  return new MailCodeDelivery(mail, text);
}

/** The pending sign-in's own key, derived from the session secret so that one
 * cannot be presented as the other. */
function signInStepSecret(): string {
  return createHash('sha256')
    .update(`sign-in-step:${jwtSecret()}`)
    .digest('hex');
}

/**
 * Wires the session-auth stack. Re-exports UsersModule and JwtModule so any
 * feature module that guards routes with `@Auth()` gets JwtAuthGuard's
 * dependencies (JwtService, UsersService) just by importing AuthModule.
 * Token lifetime is generous because revocation no longer relies on expiry —
 * DB-backed role checks and tokenVersion handle freshness (see JwtAuthGuard).
 */
@Module({
  imports: [
    UsersModule,
    MailModule,
    // Registration seeds the account's first address from the company the
    // registrant picked (FR-AUTH-10).
    AddressBookModule,
    // Whether the shop is closed, which a customer's sign-in is refused on.
    SettingsStateModule,
    // The account consent, asked on registration or the first password.
    ConsentModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    // The deployment's company-number format, compiled once at boot: a bad
    // pattern fails the startup rather than every registration.
    { provide: COMPANY_ID_RULE, useFactory: loadCompanyIdRule },
    // The grouping the staff notification puts back on a stored number.
    { provide: PHONE_INPUT, useFactory: loadPhoneInput },
    // Every door that writes an account's number reads it by this rule.
    { provide: PHONE_RULE, useFactory: loadPhoneRule },
    { provide: SIGN_IN_STEP_CONFIG, useFactory: loadSignInStep },
    { provide: SIGN_IN_STEP_SECRET, useFactory: signInStepSecret },
    {
      provide: CODE_DELIVERY,
      useFactory: codeDelivery,
      inject: [MailService, MAIL_TEXT],
    },
    SignInCodes,
    SignInStep,
    PasswordService,
    PasswordTokenService,
    PasswordPolicy,
    PasswordSetupService,
    PasswordResetService,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    SessionVaryingInterceptor,
  ],
  exports: [
    AuthService,
    PasswordService,
    PasswordTokenService,
    PasswordPolicy,
    PasswordSetupService,
    // Staff send the same link from the account screen (FR-AUTH-04).
    PasswordResetService,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    SessionVaryingInterceptor,
    JwtModule,
    UsersModule,
    // The account screens and the staff editor write numbers too.
    PHONE_RULE,
    // A holder's number change takes a code; an admin's exemption skips it.
    SignInStep,
  ],
})
export class AuthModule {}
