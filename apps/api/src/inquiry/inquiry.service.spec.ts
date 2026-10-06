import { Test } from '@nestjs/testing';
import { InquiryRequest } from '@b2b-catalog-platform/shared';
import { MAILER, Mailer } from '../mail/mailer';
import { PHONE_INPUT } from '../config/deployment-config';
import { MAIL_BRANDING } from '../mail/mail-branding';
import { MAIL_TEXT } from '../mail/mail-text';
import {
  demoMailBranding,
  demoMailText,
  demoPhoneInput,
} from '../mail/mail-text.fixture';
import { MailDispatcher } from '../mail/mail-dispatcher';
import { MailService } from '../mail/mail.service';
import { ConsentService } from '../consents/consent.service';
import { InquiryService } from './inquiry.service';

// Honeypot behaviour: the service is the last line — even if a bot
// bypasses the client form, a filled decoy field must never send mail.
describe('InquiryService', () => {
  const send = vi.fn<(mail: unknown) => Promise<void>>();
  const consents = {
    check: vi.fn(),
    record: vi.fn(),
  };
  let service: InquiryService;
  let mail: MailDispatcher;

  /** The queue is real: the submission returns before the mail goes out. */
  const settle = () => mail.flush();

  const base: InquiryRequest = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    preferredContact: 'email',
    message: 'Do you deliver to Altona?',
  };

  beforeEach(async () => {
    send.mockReset().mockResolvedValue(undefined);
    consents.check.mockReset().mockResolvedValue(null);
    consents.record.mockReset().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        InquiryService,
        MailService,
        MailDispatcher,
        { provide: MAILER, useValue: { send } satisfies Mailer },
        { provide: MAIL_TEXT, useValue: demoMailText },
        { provide: MAIL_BRANDING, useValue: demoMailBranding },
        { provide: PHONE_INPUT, useValue: demoPhoneInput },
        { provide: ConsentService, useValue: consents },
      ],
    }).compile();
    service = moduleRef.get(InquiryService);
    mail = moduleRef.get(MailDispatcher);
  });

  it('sends the shop an email for a clean submission', async () => {
    await service.submit(base);
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    // The recipient is deployment config (MAIL_STAFF_TO); this test only
    // cares that a clean submission is delivered with the sender as reply-to.
    const [message] = send.mock.calls[0] as [{ to: string; replyTo?: string }];
    expect(message.to).toBeTruthy();
    expect(message.replyTo).toBe('jane@example.com');
  });

  it('silently drops a submission with the honeypot filled — no mail sent', async () => {
    await service.submit({ ...base, website: 'http://spam.example' });
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it('treats a blank honeypot as absent and still sends', async () => {
    await service.submit({ ...base, website: '' });
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
  });

  describe('consent (NFR-LEGAL-09)', () => {
    const checked = { purpose: 'contact', pageVersionId: 'v-1' };

    it('records the consent against the address and number given', async () => {
      consents.check.mockResolvedValue(checked);

      await service.submit({
        ...base,
        phone: '+49401234567',
        consentVersion: 2,
      });
      await settle();

      expect(consents.check).toHaveBeenCalledWith('contact', 2);
      expect(consents.record).toHaveBeenCalledWith(checked, {
        email: 'jane@example.com',
        phone: '+49401234567',
      });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when the consent is refused', async () => {
      consents.check.mockRejectedValue(new Error('consent-stale'));

      await expect(service.submit(base)).rejects.toThrow('consent-stale');
      await settle();

      expect(consents.record).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('records nothing for a honeypot hit', async () => {
      await service.submit({ ...base, website: 'http://spam.example' });

      expect(consents.check).not.toHaveBeenCalled();
      expect(consents.record).not.toHaveBeenCalled();
    });
  });
});
