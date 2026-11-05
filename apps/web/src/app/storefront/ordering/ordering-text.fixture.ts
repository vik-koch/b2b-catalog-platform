import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import {
  StorefrontOrderingText,
  storefrontOrderingTextShape,
} from './ordering-text.type';

/** Ordering's block of the fixture's storefront text, for specs. */
export const defaultStorefrontOrderingText: StorefrontOrderingText = loadConfig(
  z.object({ [ORDERING_AREA]: z.object(storefrontOrderingTextShape) }),
  'texts/storefront.json',
)[ORDERING_AREA];
