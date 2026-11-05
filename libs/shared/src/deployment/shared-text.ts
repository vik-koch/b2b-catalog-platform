import * as z from 'zod';
import { ACCOUNTS_AREA } from '../core/accounts/accounts-area';
import { sharedAccountsTextShape } from '../core/accounts/accounts-text';
import { CATALOG_AREA } from '../core/catalog/catalog-area';
import { sharedCatalogTextShape } from '../core/catalog/catalog-text';
import { ORDERING_AREA } from '../core/ordering/ordering-area';
import { sharedOrderingTextShape } from '../core/ordering/ordering-text';
import { requirePageNames } from '../core/site/site-text';
import { sharedTextShape } from '../platform/config/shared-text';
import type { DeepReadonly } from '../platform/deep-readonly';
import { refuseCountForms } from '../platform/fill-text';
import { mergeShapes } from '../platform/merge-shapes';

/** `texts/shared.json` whole: every area's block, so a missing key or a stray
 * one stops the boot. */
export const sharedTextSchema = z
  .object(
    mergeShapes(
      sharedTextShape,
      { [CATALOG_AREA]: z.object(sharedCatalogTextShape).strict() },
      { [ACCOUNTS_AREA]: z.object(sharedAccountsTextShape).strict() },
      { [ORDERING_AREA]: z.object(sharedOrderingTextShape).strict() },
    ),
  )
  .strict()
  .superRefine(requirePageNames)
  .superRefine(refuseCountForms);

export type SharedTextFile = DeepReadonly<z.infer<typeof sharedTextSchema>>;
