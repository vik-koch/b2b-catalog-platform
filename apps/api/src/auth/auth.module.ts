import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../env';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';

// env.ts requires JWT_SECRET in server mode; this narrows the optional type and
// fails fast if the module is ever loaded without it.
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
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, JwtAuthGuard, RolesGuard],
  exports: [
    AuthService,
    PasswordService,
    JwtAuthGuard,
    RolesGuard,
    JwtModule,
    UsersModule,
  ],
})
export class AuthModule {}
