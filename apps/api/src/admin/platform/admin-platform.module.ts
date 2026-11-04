import { Module } from '@nestjs/common';
import { SessionModule } from '../../platform/auth/session.module';
import { OwnershipStateModule } from '../../platform/settings/ownership-state.module';
import { MediaModule } from '../../platform/media/media.module';
import { MediaController } from './media.controller';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { OwnershipController } from './ownership.controller';

/** The admin's area-free routes, behind the `@Auth` guards SessionModule supplies. */
@Module({
  imports: [SessionModule, OwnershipStateModule, MediaModule],
  controllers: [OperationsController, OwnershipController, MediaController],
  providers: [OperationsService],
})
export class AdminPlatformModule {}
