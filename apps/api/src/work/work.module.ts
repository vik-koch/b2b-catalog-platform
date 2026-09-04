import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkController } from './work.controller';
import { WorkService } from './work.service';

/**
 * The counts behind the account control's marker and the panel's notes
 * (FR-WORK-01…04). AuthModule supplies the guard that decides whose counts
 * these are.
 */
@Module({
  imports: [AuthModule],
  controllers: [WorkController],
  providers: [WorkService],
})
export class WorkModule {}
