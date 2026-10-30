import * as z from 'zod';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from './slug';

/**
 * An admin-supplied slug override on create and update. Omit the field to let
 * the server derive one from the name.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN);
