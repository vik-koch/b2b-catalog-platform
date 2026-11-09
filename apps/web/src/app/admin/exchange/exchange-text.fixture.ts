import * as z from 'zod';

import { EXCHANGE_AREA } from '@b2b-catalog-platform/shared/core/exchange';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

import {
  AdminExchangeText,
  adminExchangeTextShape,
} from './exchange-text.type';

/** The exchange's block of the fixture's admin text, for specs. */
export const defaultAdminExchangeText: AdminExchangeText = loadConfig(
  z.object({ [EXCHANGE_AREA]: z.object(adminExchangeTextShape) }),
  'texts/admin.json',
)[EXCHANGE_AREA];
