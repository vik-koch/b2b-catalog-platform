import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { loadSessionIdleDays } from '../config/deployment-config';
import { env } from '../env';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalAuthGuard } from './optional-auth.guard';
import { RolesGuard } from './roles.guard';
import { SessionVaryingInterceptor } from './session-varying.interceptor';
import { SESSION_IDLE_DAYS, Sessions } from './sessions';

/** Called from factories only, never at import: the one-shot run modes
 * (migrate, bootstrap-admin) import the app module and get no secret. */
export function jwtSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return env.JWT_SECRET;
}

/** The session and the guards that read it, for any module whose routes use
 * `@Auth()` or `@TierPriced()`. */
@Module({
  imports: [
    // No default lifetime: each kind of token sets its own (Sessions,
    // SignInStep).
    JwtModule.registerAsync({
      useFactory: () => ({ secret: jwtSecret() }),
    }),
  ],
  providers: [
    { provide: SESSION_IDLE_DAYS, useFactory: loadSessionIdleDays },
    Sessions,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    SessionVaryingInterceptor,
  ],
  exports: [
    JwtModule,
    Sessions,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    SessionVaryingInterceptor,
  ],
})
export class SessionModule {}
