import { Module } from '@nestjs/common';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';
import { INQUIRY_TEXT, defaultInquiryText } from './inquiry-text';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [InquiryController],
  providers: [
    InquiryService,
    { provide: INQUIRY_TEXT, useValue: defaultInquiryText },
  ],
})
export class InquiryModule {}
