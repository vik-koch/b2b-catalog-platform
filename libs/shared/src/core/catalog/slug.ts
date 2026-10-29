import * as z from 'zod';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from './slug-constants';

/**
 * Validator for an admin-supplied slug override (create/update bodies). Omit the
 * field to let the server derive one from the name instead — see `slugify`.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN);
// NOTE: the `slugify()` transliteration function lives in its own module
// (`slugify.ts`), and the pattern and limit in `slug-constants.ts`, so a page
// that checks a slug loads neither Zod nor the CJS `slugify` package, which
// would leak untree-shakeable into every eager bundle.
