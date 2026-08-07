import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AccountController } from './account.controller';

/**
 * Self-service for the signed-in account. Kept apart from StaffUsersModule for
 * the same reason the contracts are: one answers "who may manage this person",
 * the other only ever serves the session's own row.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AccountController],
})
export class AccountModule {}
