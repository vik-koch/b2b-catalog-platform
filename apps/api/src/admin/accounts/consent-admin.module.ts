import { Module } from '@nestjs/common';

import { AuditLogger } from '../../platform/audit/audit.logger';
import { SessionModule } from '../../platform/auth/session.module';
import { ConsentAdminController } from './consent-admin.controller';
import { ConsentRecords } from './consent-records';

/** The staff side of consent. */
@Module({
  imports: [SessionModule],
  controllers: [ConsentAdminController],
  providers: [ConsentRecords, AuditLogger],
  // An account's own screen lists its records too.
  exports: [ConsentRecords],
})
export class ConsentAdminModule {}
