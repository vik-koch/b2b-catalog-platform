import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import { OWNERSHIP_AREAS } from '../../platform/ownership-constants';
import { ownedAreasSchema } from '../platform/ownership.contract';

/** One direction, one or more areas: the master switch is one request, so one
 * transaction and one audit entry, never half done. */
const setOwnershipSchema = z
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

export const adminOwnershipSwitchContract = {
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
