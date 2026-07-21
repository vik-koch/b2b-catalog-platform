import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { CONTACT_TEXT, defaultContactText } from './contact-text';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [ContactController],
  providers: [
    ContactService,
    { provide: CONTACT_TEXT, useValue: defaultContactText },
  ],
})
export class ContactModule {}
