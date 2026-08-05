import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogger } from '../audit/audit.logger';
import { TiersController } from './tiers.controller';
import { TiersService } from './tiers.service';

/**
 * Customer tiers (FR-AUTH-05). Its own module rather than part of the catalog:
 * tiers are referenced by users as much as by prices, and phase 3's user
 * administration needs the service without the catalog write surface.
 */
@Module({
  imports: [AuthModule],
  controllers: [TiersController],
  providers: [TiersService, AuditLogger],
  exports: [TiersService],
})
export class TiersModule {}
