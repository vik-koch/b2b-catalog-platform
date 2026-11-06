import { oc } from '@orpc/contract';
import * as z from 'zod';
import { emailField, personNameField } from '../../platform/contact-config';
import {
  blankAsAbsent,
  honeypotField,
} from '../../platform/form-fields.contract';
import { consentErrors } from '../../core/site/pages';
import { consentVersionField } from '../../core/site/page.contract';
import {
  INQUIRY_MESSAGE_MAX_LENGTH,
  INQUIRY_PHONE_MAX_LENGTH,
} from './inquiry';

/** At least one of email or phone; `preferredContact` says which to use. */
export const inquiryRequestSchema = z
  .object({
    name: personNameField,
    email: blankAsAbsent(emailField.optional()),
    phone: blankAsAbsent(
      z.string().trim().max(INQUIRY_PHONE_MAX_LENGTH).optional(),
    ),
    preferredContact: z.enum(['email', 'phone']),
    message: blankAsAbsent(
      z.string().trim().max(INQUIRY_MESSAGE_MAX_LENGTH).optional(),
    ),
    website: honeypotField,
    consentVersion: consentVersionField,
  })
  .strict()
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: 'Provide an email address or a phone number.',
    path: ['email'],
  });

export type InquiryRequest = z.infer<typeof inquiryRequestSchema>;

export const inquiryContract = {
  submit: oc
    .route({
      method: 'POST',
      path: '/inquiry',
      inputStructure: 'detailed',
      summary: 'Submit the inquiry form',
    })
    .errors(consentErrors)
    .input(z.object({ body: inquiryRequestSchema }))
    .output(z.object({ ok: z.literal(true) })),
};
