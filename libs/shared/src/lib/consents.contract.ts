import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from './api-error';
import { CONSENT_PURPOSES, CONSENT_WITHDRAWAL_REASONS } from './page-constants';
import { USER_STATUSES } from './user-constants';

/**
 * One consent as staff read it (NFR-LEGAL-09): what was consented to, when,
 * by whom, and the box wording that was ticked — the version's own, since
 * that is what the record proves.
 *
 * Loose on the holder's address and number: they are copies taken when the
 * consent was given, and a read that refused one stored before a format rule
 * tightened would take the whole list down with it.
 */
export const consentRecordSchema = z
  .object({
    id: z.uuid(),
    purpose: z.enum(CONSENT_PURPOSES),
    givenAt: z.iso.datetime(),
    /** The consent text's version, and the box wording it carried. */
    version: z.number().int().positive(),
    label: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    /**
     * The account the consent was given for, while it still exists. Null for
     * an inquiry, and for a registration that was declined and removed.
     */
    account: z
      .object({
        id: z.uuid(),
        name: z.string().nullable(),
        status: z.enum(USER_STATUSES),
      })
      .strict()
      .nullable(),
    /**
     * When and how the consent ended, once it has. The record's retention
     * runs from here; an inquiry's consent is used up, not withdrawn, and
     * mostly never gets one.
     */
    withdrawal: z
      .object({
        at: z.iso.datetime(),
        reason: z.enum(CONSENT_WITHDRAWAL_REASONS),
        /** The admin who entered it, as their address read then. */
        enteredBy: z.string().nullable(),
        note: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ConsentRecord = z.infer<typeof consentRecordSchema>;

export const consentRecordListSchema = z
  .object({ consents: z.array(consentRecordSchema) })
  .strict();

/**
 * Whose records to find: an email address or a phone number, exactly one. An
 * address also finds an account's records under its current address, which
 * may differ from the one copied into a record when it was given.
 */
export const findConsentsQuerySchema = z
  .object({
    email: z.string().trim().max(320).optional(),
    /** As the forms store it: the country code and the digits. */
    phone: z.string().trim().max(50).optional(),
  })
  .refine((query) => Boolean(query.email) !== Boolean(query.phone), {
    message: 'Give an email address or a phone number.',
  });
export type FindConsentsQuery = z.infer<typeof findConsentsQuerySchema>;

export const consentsContract = {
  findConsents: oc
    .errors(commonAuthErrors)
    .route({
      method: 'GET',
      path: '/admin/consents',
      inputStructure: 'detailed',
      summary: 'Find consent records by email address or phone (admin)',
    })
    .input(z.object({ query: findConsentsQuerySchema }))
    .output(consentRecordListSchema),
};
