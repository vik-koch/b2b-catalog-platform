import { defaultSharedText } from '../../platform/config/shared-text.fixture';
import {
  ACCOUNTS_AREA,
  type SharedAccountsText,
} from '@b2b-catalog-platform/shared/core/accounts';
import { sharedTextBlock } from '../../platform/config/shared-text';

/** The accounts' block of the fixture's shared text, for specs. */
export const defaultSharedAccountsText = sharedTextBlock<SharedAccountsText>(
  defaultSharedText,
  ACCOUNTS_AREA,
);
