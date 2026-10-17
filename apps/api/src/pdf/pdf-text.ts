import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { refuseCountForms } from '@b2b-catalog-platform/shared';
import * as z from 'zod';

/**
 * The wording of the documents the API draws, loaded whole from the mounted
 * PDF_TEXT_FILE at boot. Server-only, like the mail text: it is rendered into
 * a file and read long after the screens that offered it.
 */
export const pdfTextSchema = z
  .object({
    /** The order summary (FR-ORD-05, FR-ACC-02). */
    orderSummary: z
      .object({
        /** Carries `{reference}`. */
        title: z.string(),
        placedLabel: z.string(),
        statusLabel: z.string(),
        paymentLabel: z.string(),
        invoiceLabel: z.string(),
        deliveryLabel: z.string(),
        pickupLabel: z.string(),
        whenLabel: z.string(),
        /** Where the customer named no date. */
        whenAny: z.string(),
        contactLabel: z.string(),
        noteLabel: z.string(),
        /** The shop's account of what it changed (FR-ORD-03), where there is
         * one. A document that left them out would state a total the customer
         * could not account for. */
        changesLabel: z.string(),
        itemsLabel: z.string(),
        quantityLabel: z.string(),
        lineTotalLabel: z.string(),
        totalLabel: z.string(),
        /** As in `orderReceived`. */
        termsLabel: z.string(),
        termsVersion: z.string(),
        /** How to return the goods, printed under the total (NFR-LEGAL-10):
         * the summary is the paper handed over with them. Absent, nothing is
         * printed. */
        returnNotice: z.string().optional(),
        /** Printed at the foot of every page: what this document is, and what
         * it is not (ADR 0052). */
        footer: z.string(),
        statuses: z
          .object({
            requested: z.string(),
            approved: z.string(),
            ready: z.string(),
            completed: z.string(),
            declined: z.string(),
            cancelled: z.string(),
          })
          .strict(),
        payments: z
          .object({
            cash: z.string(),
            bankTransfer: z.string(),
            cardLater: z.string(),
          })
          .strict(),
        paymentStates: z
          .object({
            notDue: z.string(),
            awaiting: z.string(),
            paid: z.string(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine(refuseCountForms);

export type PdfText = DeepReadonly<z.infer<typeof pdfTextSchema>>;

export const PDF_TEXT = 'PDF_TEXT';
