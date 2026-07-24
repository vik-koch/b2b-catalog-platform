import { Test } from '@nestjs/testing';
import { InquiryRequest } from '@b2b-catalog-platform/shared';
import { MAILER, Mailer } from '../mail/mailer';
import { INQUIRY_TEXT } from './inquiry-text';
import { demoInquiryText } from './inquiry-text.fixture';
import { InquiryService } from './inquiry.service';

// Honeypot behaviour: the service is the last line — even if a bot
// bypasses the client form, a filled decoy field must never send mail.
describe('InquiryService', () => {
  const send = jest.fn<Promise<void>, [unknown]>();
  let service: InquiryService;

  const base: InquiryRequest = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    preferredContact: 'email',
    message: 'Do you deliver to Altona?',
  };

  beforeEach(async () => {
    send.mockReset().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        InquiryService,
        { provide: MAILER, useValue: { send } satisfies Mailer },
        { provide: INQUIRY_TEXT, useValue: demoInquiryText },
      ],
    }).compile();
    service = moduleRef.get(InquiryService);
  });

  it('sends the shop an email for a clean submission', async () => {
    await service.submit(base);

    expect(send).toHaveBeenCalledTimes(1);
    // The recipient is deployment config (MAIL_CONTACT_TO); this test only
    // cares that a clean submission is delivered with the sender as reply-to.
    const [message] = send.mock.calls[0] as [{ to: string; replyTo?: string }];
    expect(message.to).toBeTruthy();
    expect(message.replyTo).toBe('jane@example.com');
  });

  it('silently drops a submission with the honeypot filled — no mail sent', async () => {
    await expect(
      service.submit({ ...base, website: 'http://spam.example' }),
    ).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
  });

  it('treats a blank honeypot as absent and still sends', async () => {
    await service.submit({ ...base, website: '' });

    expect(send).toHaveBeenCalledTimes(1);
  });
});
