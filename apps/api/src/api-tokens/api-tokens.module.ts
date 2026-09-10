import { Module } from '@nestjs/common';
import { AuditLogger } from '../audit/audit.logger';
import { AuthModule } from '../auth/auth.module';
import { ApiTokensController } from './api-tokens.controller';
import { ApiTokensService } from './api-tokens.service';

/**
 * Machine tokens (NFR-SEC-09): the credential itself, the admin surface that
 * issues it, and the guard that checks it. Exported, because every machine
 * endpoint a later slice adds is guarded from here.
 */
@Module({
  imports: [AuthModule],
  controllers: [ApiTokensController],
  providers: [ApiTokensService, AuditLogger],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
