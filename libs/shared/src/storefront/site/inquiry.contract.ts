import { oc } from '@orpc/contract';
import * as z from 'zod';
import { emailField } from '../../lib/config/contact-config';
import {
  blankAsAbsent,
  honeypotField,
} from '../../platform/form-fields.contract';
import { consentErrors } from '../../core/site/pages';
import { consentVersionField } from '../../core/site/page.contract';

/** At least one of email or phone; `preferredContact` says which to use. */
export const inquiryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: blankAsAbsent(emailField(320).optional()),
    phone: blankAsAbsent(z.string().trim().max(50).optional()),
    preferredContact: z.enum(['email', 'phone']),
    message: blankAsAbsent(z.string().trim().max(5000).optional()),
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
