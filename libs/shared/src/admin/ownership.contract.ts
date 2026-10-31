import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../lib/core/api-error';
import { OWNERSHIP_AREAS } from '../sync/ownership-constants';

/**
 * Which areas of the platform's data an external system currently owns
 * (FR-ADM-10). An area in this list is one the platform's own ways in are
 * closed for; an area absent from it is one the automated exchange is closed
 * for. There is no third state: that mutual exclusion is the whole point, since
 * two writers for one column has no answer to "who changed this".
 */
export const ownedAreasSchema = z.object({
  ownedAreas: z.array(z.enum(OWNERSHIP_AREAS)),
});
export type OwnedAreas = z.infer<typeof ownedAreasSchema>;

/**
 * One direction, one or more areas. A list rather than a single area because
 * the panel offers a master switch over the whole shop as well as a row per
 * area, and one request is what makes that one transaction and one audit
 * entry: a master switch that fired three requests could half-succeed and
 * leave the shop in a state nobody asked for.
 *
 * Non-empty and deduplicated: an empty list is a request that asks for
 * nothing, and a repeated area is the same question twice.
 */
export const setOwnershipSchema = z
  .object({
    areas: z
      .array(z.enum(OWNERSHIP_AREAS))
      .min(1)
      .refine((areas) => new Set(areas).size === areas.length, {
        message: 'An area may be named only once',
      }),
    owned: z.boolean(),
  })
  .strict();
export type SetOwnershipRequest = z.infer<typeof setOwnershipSchema>;

export const adminOwnershipContract = {
  getOwnership: oc
    .route({
      method: 'GET',
      path: '/settings/ownership',
      summary: 'Which areas an external system owns (admin only)',
    })
    .errors(commonAuthErrors)
    .output(ownedAreasSchema),

  setOwnership: oc
    .route({
      method: 'PUT',
      path: '/settings/ownership',
      inputStructure: 'detailed',
      summary: 'Hand areas to an external system, or take them back (admin)',
    })
    .errors(commonAuthErrors)
    .input(z.object({ body: setOwnershipSchema }))
    .output(ownedAreasSchema),
};
