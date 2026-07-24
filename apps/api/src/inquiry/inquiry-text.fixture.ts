import { InquiryText } from './inquiry-text';

/**
 * Complete, schema-shaped demo inquiry-email wording for tests only. Never
 * imported by production code, so no demo wording is baked into the image.
 * Mirrors config/inquiry-text.json (to be replaced by templates later on).
 */
export const demoInquiryText: InquiryText = {
  inquiry: {
    subject: 'Inquiry',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    preferredContact: 'Preferred contact',
    message: 'Message',
  },
};
