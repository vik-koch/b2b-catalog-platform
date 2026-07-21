import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

// Empty form fields arrive as '' — treat them as absent so optional fields
// (and the email-format check) behave correctly.
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Inquiry form submission (FR-NAV-06). Name is required; at least one of email
 * or phone must be given (both are allowed), and `preferredContact` records
 * which the visitor wants used.
 */
export const inquiryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.preprocess(
      emptyToUndefined,
      z.string().trim().email().max(320).optional(),
    ),
    phone: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
    preferredContact: z.enum(['email', 'phone']),
    message: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(5000).optional(),
    ),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: 'Provide an email address or a phone number.',
    path: ['email'],
  });

export type InquiryRequest = z.infer<typeof inquiryRequestSchema>;

export const inquiryContract = c.router({
  submit: {
    method: 'POST',
    path: '/inquiry',
    body: inquiryRequestSchema,
    responses: {
      200: z.object({ ok: z.literal(true) }),
      400: z.object({ message: z.string() }),
    },
    summary: 'Submit the inquiry form',
  },
});
