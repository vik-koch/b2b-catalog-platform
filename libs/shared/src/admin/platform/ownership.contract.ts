import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import { OWNERSHIP_AREAS } from '../../platform/ownership-constants';

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

export const adminOwnershipContract = {
  getOwnership: oc
    .route({
      method: 'GET',
      path: '/settings/ownership',
      summary: 'Which areas an external system owns (admin only)',
    })
    .errors(commonAuthErrors)
    .output(ownedAreasSchema),
};
