import { Module } from '@nestjs/common';
import {
  CONSENT_PURPOSES_ASKED,
  loadConsentPurposesAsked,
} from '../config/deployment-config';
import { ConsentService } from './consent.service';

@Module({
  providers: [
    ConsentService,
    { provide: CONSENT_PURPOSES_ASKED, useFactory: loadConsentPurposesAsked },
  ],
  exports: [ConsentService],
})
export class ConsentModule {}
