import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  COMPANY_ID_RULE,
  loadCompanyIdRule,
  loadPhoneInput,
  PHONE_INPUT,
} from '../config/deployment-config';
import { env } from '../env';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
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
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    SessionVaryingInterceptor,
    JwtModule,
    UsersModule,
  ],
})
export class AuthModule {}
