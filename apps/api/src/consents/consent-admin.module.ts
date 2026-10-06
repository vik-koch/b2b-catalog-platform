import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConsentAdminController } from './consent-admin.controller';
import { ConsentModule } from './consent.module';

/**
 * The staff side of consent. Apart from ConsentModule because AuthModule,
 * which the guards come from, imports that one.
 */
@Module({
  imports: [AuthModule, ConsentModule],
  controllers: [ConsentAdminController],
})
export class ConsentAdminModule {}
