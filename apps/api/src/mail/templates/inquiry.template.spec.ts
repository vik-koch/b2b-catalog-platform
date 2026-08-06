import { InquiryRequest } from '@b2b-catalog-platform/shared';
import { demoMailText } from '../mail-text.fixture';
import { inquiryMail } from './inquiry.template';

const submission: InquiryRequest = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  preferredContact: 'email',
  message: 'Do you deliver to Altona?',
};

describe('inquiryMail', () => {
  it('puts the submitter in the subject, after the configured prefix', () => {
    expect(inquiryMail(submission, demoMailText).subject).toBe(
      'Inquiry: Jane Doe',
    );
  });

  it('lists every field in order, using the configured labels', () => {
    const { rows } = inquiryMail(submission, demoMailText);

    expect(rows).toEqual([
      { label: 'Name', value: 'Jane Doe' },
      { label: 'Email', value: 'jane@example.com' },
      { label: 'Phone', value: '—' },
      { label: 'Preferred contact', value: 'email' },
      { label: 'Message', value: 'Do you deliver to Altona?' },
    ]);
  });

  it('keeps a row for an omitted field rather than dropping it', () => {
    const { rows } = inquiryMail(
      { name: 'Jane Doe', phone: '+49 40 1234567', preferredContact: 'phone' },
      demoMailText,
    );

    expect(rows?.map((row) => row.label)).toEqual([
      'Name',
      'Email',
      'Phone',
      'Preferred contact',
      'Message',
    ]);
    expect(rows?.[1].value).toBe('—');
  });
});
