import { Module } from '@nestjs/common';
import { SessionModule } from '../../platform/auth/session.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

/** The admin's area-free reads, behind the `@Auth` guards SessionModule supplies. */
@Module({
  imports: [SessionModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class AdminPlatformModule {}
