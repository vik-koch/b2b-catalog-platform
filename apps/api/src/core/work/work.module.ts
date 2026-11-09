import { Module } from '@nestjs/common';

import { SessionModule } from '../../platform/auth/session.module';
import { WorkController } from './work.controller';
import { WorkService } from './work.service';

@Module({
  imports: [SessionModule],
  controllers: [WorkController],
  providers: [WorkService],
})
export class WorkModule {}
