import * as z from 'zod';

import { EXCHANGE_AREA } from '@b2b-catalog-platform/shared/core/exchange';
import { loadConfigFile } from '@b2b-catalog-platform/shared/node';

import { ExchangeMailText, exchangeMailTextShape } from './exchange-mail-text';

/** The exchange's block of the demo mail text, for specs. */
export const demoExchangeMailText: ExchangeMailText = loadConfigFile(
  z.object({ [EXCHANGE_AREA]: z.object(exchangeMailTextShape) }),
  'deployments/fixture/config/texts/mail.json',
)[EXCHANGE_AREA];
