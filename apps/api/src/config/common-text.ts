import { CommonText, commonTextSchema } from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/** The shop's shared names (see deployments/fixture/config/README.md), read whole at boot. */
export const COMMON_TEXT = 'COMMON_TEXT';

export function loadCommonText(): CommonText {
  return loadConfig(commonTextSchema, 'texts/common.json');
}
