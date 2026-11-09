import { Module } from '@nestjs/common';

import { ConsentService } from './consent.service';
import {
  CONSENT_PURPOSES_ASKED,
  loadConsentPurposesAsked,
} from './site-config';

@Module({
  providers: [
    ConsentService,
    { provide: CONSENT_PURPOSES_ASKED, useFactory: loadConsentPurposesAsked },
  ],
  exports: [ConsentService],
})
export class ConsentModule {}
