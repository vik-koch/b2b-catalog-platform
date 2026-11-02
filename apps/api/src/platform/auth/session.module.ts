import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { loadSessionIdleDays } from '../../config/deployment-config';
import { env } from '../../env';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalAuthGuard } from './optional-auth.guard';
import { RolesGuard } from './roles.guard';
import { SessionUsers } from './session-users';
import { SessionVaryingInterceptor } from './session-varying.interceptor';
import { SESSION_IDLE_DAYS, Sessions } from './sessions';

// env.ts requires JWT_SECRET in server mode; this narrows the optional type and
// fails fast if the module is ever instantiated without it. Called from a
// factory, never at module-evaluation time: main.ts imports AppModule
// unconditionally, and the one-shot RUN_MODEs (migrate, bootstrap-admin)
// exit before Nest boots — they have no session to sign and are given no secret.
export function jwtSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return env.JWT_SECRET;
}

/**
 * The session and the guards that read it. Any module whose routes use
 * `@Auth()` or `@TierPriced()` imports this one. A session slides rather than
 * expiring at a fixed time, because revocation does not rely on expiry:
 * DB-backed role checks and tokenVersion handle freshness (see JwtAuthGuard).
 */
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
    SessionUsers,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    SessionVaryingInterceptor,
  ],
  exports: [
    JwtModule,
    Sessions,
    SessionUsers,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    SessionVaryingInterceptor,
  ],
})
export class SessionModule {}
