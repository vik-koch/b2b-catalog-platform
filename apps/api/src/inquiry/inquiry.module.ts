import { Module } from '@nestjs/common';
import { loadPhoneInput, PHONE_INPUT } from '../config/deployment-config';
import { MailModule } from '../mail/mail.module';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';

// Wording and rendering both come from MailModule now: the inquiry is one
// template among the app's messages, not a mechanism of its own.
@Module({
  imports: [MailModule],
  controllers: [InquiryController],
  providers: [
    InquiryService,
    // The grouping the staff mail puts back on the submitted number.
    { provide: PHONE_INPUT, useFactory: loadPhoneInput },
  ],
})
export class InquiryModule {}
