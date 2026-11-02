import { Module } from '@nestjs/common';
import { AuditLogger } from '../../audit/audit.logger';
import { SessionModule } from '../../platform/auth/session.module';
import { ConsentAdminController } from './consent-admin.controller';
import { ConsentRecords } from './consent-records';

/** The staff side of consent: the records, and the withdrawals staff enter. */
@Module({
  imports: [SessionModule],
  controllers: [ConsentAdminController],
  providers: [ConsentRecords, AuditLogger],
  // An account's own screen lists its records too.
  exports: [ConsentRecords],
})
export class ConsentAdminModule {}
