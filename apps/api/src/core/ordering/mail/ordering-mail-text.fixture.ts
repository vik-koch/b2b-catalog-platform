import * as z from 'zod';
import { loadConfigFile } from '@b2b-catalog-platform/shared/node';
import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import { OrderingMailText, orderingMailTextShape } from './ordering-mail-text';

/** Ordering's block of the demo mail text, for specs. */
export const demoOrderingMailText: OrderingMailText = loadConfigFile(
  z.object({ [ORDERING_AREA]: z.object(orderingMailTextShape) }),
  'deployments/fixture/config/texts/mail.json',
)[ORDERING_AREA];
