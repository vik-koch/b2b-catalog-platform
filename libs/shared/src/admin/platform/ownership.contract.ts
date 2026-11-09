import { oc } from '@orpc/contract';
import * as z from 'zod';

import { commonAuthErrors } from '../../platform/api-error';
import { OWNERSHIP_AREAS } from '../../platform/ownership';

/** The areas another system owns (FR-ADM-10): closed to the platform's own
 * writes, while the rest are closed to the exchange. Never both writers. */
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
