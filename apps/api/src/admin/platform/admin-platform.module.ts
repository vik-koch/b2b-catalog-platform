import { Module } from '@nestjs/common';
import { SessionModule } from '../../platform/auth/session.module';
import { OwnershipStateModule } from '../../platform/settings/ownership-state.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { OwnershipController } from './ownership.controller';

/** The admin's area-free reads, behind the `@Auth` guards SessionModule supplies. */
@Module({
  imports: [SessionModule, OwnershipStateModule],
  controllers: [OperationsController, OwnershipController],
  providers: [OperationsService],
})
export class AdminPlatformModule {}
