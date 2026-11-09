import { Module } from '@nestjs/common';

import { ConsentModule } from '../../core/site/consent.module';
import {
  loadPhoneInput,
  PHONE_INPUT,
} from '../../platform/config/deployment-config';
import { MailModule } from '../../platform/mail/mail.module';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';

@Module({
  imports: [MailModule, ConsentModule],
  controllers: [InquiryController],
  providers: [
    InquiryService,
    // The grouping the staff mail puts back on the submitted number.
    { provide: PHONE_INPUT, useFactory: loadPhoneInput },
  ],
})
export class InquiryModule {}
