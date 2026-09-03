import { oc } from '@orpc/contract';
import * as z from 'zod';
import { addressComponentsSchema } from './address.contract';

/**
 * Company suggestion (FR-AUTH-09, ADR 0041). The twin of the address
 * suggestion, and deliberately its own contract: a company and an address are
 * different subjects, answered by different endpoints of the same sidecar, and
 * a deployment may have one without the other.
 */

/**
 * NFR-SEC-08: metered, so the query is bounded at both ends — two letters match
 * half a register and would be a paid call that cannot mean anything.
 */
export const PARTY_QUERY_MIN_LENGTH = 3;
export const PARTY_QUERY_MAX_LENGTH = 120;
export const PARTY_SUGGESTION_LIMIT = 8;

/**
 * Whether the party is an organisation or a person trading as one. It decides
 * one thing, and it is not cosmetic: an individual entrepreneur's registered
 * address is usually their home, so no address is ever seeded from one (ADR
 * 0041). Absent where the provider does not say, which counts as "not a legal
 * entity" for that rule.
 */
export const partyEntityTypeSchema = z.enum(['legal', 'individual']);
export type PartyEntityType = z.infer<typeof partyEntityTypeSchema>;

/**
 * One row of the dropdown, and what picking it fills in. Only the name is
 * certain: providers answer at different granularities, a register may hold a
 * company with no number worth showing, and a partial answer still saves most
 * of the typing.
 *
 * `address` is the party's **registered** address, in the same components an
 * address suggestion returns — so it drops into the same columns and needs no
 * second shape to maintain.
 */
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
 * Proxied so the provider credential stays server-side (NFR-SEC-08), and
 * unauthenticated because the form that uses it is the registration form — the
 * one place where, by definition, nobody has an account yet.
 *
 * `/companies/...` rather than `/parties/...`: what a visitor is looking for is
 * their company, whatever the domain calls the role it plays on an order.
 *
 * A deployment with no sidecar configured answers with an empty list, which is
 * what makes the field degrade to plain typing.
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
          /** A name or a registration number — the provider decides which. */
          q: z.string().trim().min(1).max(PARTY_QUERY_MAX_LENGTH),
        }),
      }),
    )
    .output(z.object({ items: z.array(partySuggestionSchema) })),
};
