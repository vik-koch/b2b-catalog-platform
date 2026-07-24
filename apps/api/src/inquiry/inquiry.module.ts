import { Module } from '@nestjs/common';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { MailModule } from '../mail/mail.module';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';
import { INQUIRY_TEXT, inquiryTextSchema } from './inquiry-text';

@Module({
  imports: [MailModule],
  controllers: [InquiryController],
  providers: [
    InquiryService,
    {
      // Loaded whole from the mounted JSON named by INQUIRY_TEXT_FILE.
      // No built-in default: an unset var or a bad/incomplete file fails
      // the boot rather than silently sending demo-worded email.
      provide: INQUIRY_TEXT,
      useFactory: () => loadConfig(inquiryTextSchema, 'INQUIRY_TEXT_FILE'),
    },
  ],
})
export class InquiryModule {}
