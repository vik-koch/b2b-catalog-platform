import { Module } from '@nestjs/common';
import { SessionModule } from '../platform/auth/session.module';
import { WorkController } from './work.controller';
import { WorkService } from './work.service';

/**
 * The counts behind the account control's marker and the panel's notes
 * (FR-WORK-01…04). SessionModule supplies the guard that decides whose counts
 * these are.
 */
@Module({
  imports: [SessionModule],
  controllers: [WorkController],
  providers: [WorkService],
})
export class WorkModule {}
