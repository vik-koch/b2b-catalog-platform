import { CommonText, commonTextSchema } from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/** The committed demo glossary, for tests only (see app-text.fixture.ts). */
export const defaultCommonText: CommonText = loadConfig(
  commonTextSchema,
  'COMMON_TEXT_FILE',
);
