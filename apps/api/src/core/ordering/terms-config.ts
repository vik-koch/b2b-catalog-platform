import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import { loadApiConfigBlock } from '../../platform/config/api-config';
import * as z from 'zod';
import { orderingApiConfigShape } from './ordering-api-config';

/** Whether the receipt attaches the accepted terms as a document. */
export const TERMS_ATTACHED = 'TERMS_ATTACHED';

export function loadTermsAttached(): boolean {
  return loadApiConfigBlock(
    ORDERING_AREA,
    z.object(orderingApiConfigShape).strict(),
  ).terms.attachToReceipt;
}
