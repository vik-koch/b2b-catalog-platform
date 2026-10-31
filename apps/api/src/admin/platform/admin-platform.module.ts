import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

/** The admin's area-free reads, behind the `@Auth` guards AuthModule supplies. */
@Module({
  imports: [AuthModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class AdminPlatformModule {}
