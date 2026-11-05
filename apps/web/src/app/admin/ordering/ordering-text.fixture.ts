import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import {
  AdminOrderingText,
  adminOrderingTextShape,
} from './ordering-text.type';

/** Ordering's block of the fixture's admin text, for specs. */
export const defaultAdminOrderingText: AdminOrderingText = loadConfig(
  z.object({ [ORDERING_AREA]: z.object(adminOrderingTextShape) }),
  'texts/admin.json',
)[ORDERING_AREA];
