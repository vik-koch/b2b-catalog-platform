import { Module } from '@nestjs/common';
import { SessionModule } from '../platform/auth/session.module';
import { OwnershipController } from './ownership.controller';
import { OwnershipSwitch } from './ownership-switch';

/** The ownership switch, behind the `@Auth` guards SessionModule supplies. */
@Module({
  imports: [SessionModule],
  controllers: [OwnershipController],
  providers: [OwnershipSwitch],
})
export class OwnershipModule {}
