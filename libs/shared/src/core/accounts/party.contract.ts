import { oc } from '@orpc/contract';
import * as z from 'zod';

import { addressComponentsSchema } from './address.contract';
import { PARTY_QUERY_MAX_LENGTH } from './party';

/** An organisation, or a person trading as one, whose registered address is
 * usually their home and so never seeds an address. Absent counts as the latter. */
export const partyEntityTypeSchema = z.enum(['legal', 'individual']);

/** One row of the dropdown. Only the name is certain; `address` is the
 * registered one, in the components an address suggestion returns. */
export const partySuggestionSchema = z
  .object({
    name: z.string().min(1).max(255),
    registrationId: z.string().max(64).optional(),
    entityType: partyEntityTypeSchema.optional(),
    address: addressComponentsSchema.optional(),
  })
  .strict();
export type PartySuggestion = z.infer<typeof partySuggestionSchema>;

/**
 * Company suggestion, proxied so the provider credential stays server-side
 * (NFR-SEC-08), and open because registration uses it. Without a sidecar the
 * list is empty and the field is plain typing.
 */
export const partySuggestionContract = {
  suggestParties: oc
    .route({
      method: 'GET',
      path: '/companies/suggestions',
      inputStructure: 'detailed',
      summary: 'Companies matching what the customer is typing',
    })
    .input(
      z.object({
        query: z.object({
          /** A name or a registration number: the provider decides which. */
          q: z.string().trim().min(1).max(PARTY_QUERY_MAX_LENGTH),
        }),
      }),
    )
    .output(z.object({ items: z.array(partySuggestionSchema) })),
};
