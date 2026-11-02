import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Owns the `users` table for the auth layer (find an account, set its
 * password). The staff-facing management surface lives in StaffUsersModule,
 * which depends on AuthModule — keeping them apart is what stops the cycle,
 * since AuthModule depends on this one.
 *
 * DatabaseModule is global, so this only provides and exports the service.
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
