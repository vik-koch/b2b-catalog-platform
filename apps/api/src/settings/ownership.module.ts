import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OwnershipController } from './ownership.controller';
import { OwnershipSwitch } from './ownership-switch';

/** The ownership switch, behind the `@Auth` guards AuthModule supplies. */
@Module({
  imports: [AuthModule],
  controllers: [OwnershipController],
  providers: [OwnershipSwitch],
})
export class OwnershipModule {}
