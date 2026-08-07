import { Module } from '@nestjs/common';
import { AuditLogger } from '../audit/audit.logger';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AccountController } from './account.controller';
import { AccountDeletion } from './account-deletion';

/**
 * Self-service for the signed-in account. Kept apart from StaffUsersModule for
 * the same reason the contracts are: one answers "who may manage this person",
 * the other only ever serves the session's own row.
 */
@Module({
  imports: [AuthModule, UsersModule, MailModule],
  controllers: [AccountController],
  providers: [AccountDeletion, AuditLogger],
})
export class AccountModule {}
