import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';

// Wording and rendering both come from MailModule now: the inquiry is one
// template among the app's messages, not a mechanism of its own.
@Module({
  imports: [MailModule],
  controllers: [InquiryController],
  providers: [InquiryService],
})
export class InquiryModule {}
