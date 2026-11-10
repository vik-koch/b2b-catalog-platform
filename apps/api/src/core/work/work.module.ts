import { Module } from '@nestjs/common';

import { SessionModule } from '../../platform/auth/session.module';
import {
  loadShopTimeZone,
  SHOP_TIME_ZONE,
} from '../../platform/config/deployment-config';
import { WorkController } from './work.controller';
import { WorkService } from './work.service';

@Module({
  imports: [SessionModule],
  controllers: [WorkController],
  providers: [
    WorkService,
    { provide: SHOP_TIME_ZONE, useFactory: loadShopTimeZone },
  ],
})
export class WorkModule {}
