import {
  type CustomerSyncPolicy,
  DEFAULT_CUSTOMER_SYNC_POLICY,
  DEFAULT_SYNC_POLICY,
  EXCHANGE_AREA,
  type SyncPolicy,
} from '@b2b-catalog-platform/shared/core/exchange';
import { loadApiConfigBlock } from '../../platform/config/api-config';
import type { ExchangeApiConfig } from './exchange-api-config';

const loadExchangeConfig = () =>
  loadApiConfigBlock<ExchangeApiConfig | undefined>(EXCHANGE_AREA);

/** The ceilings an automated catalog run is judged against. */
export const SYNC_POLICY = 'SYNC_POLICY';

export function loadSyncPolicy(): SyncPolicy {
  return loadExchangeConfig()?.autoApply ?? DEFAULT_SYNC_POLICY;
}

/** The customer exchange's own ceilings (FR-ADM-11). */
export const CUSTOMER_SYNC_POLICY = 'CUSTOMER_SYNC_POLICY';

export function loadCustomerSyncPolicy(): CustomerSyncPolicy {
  return (
    loadExchangeConfig()?.customerAutoApply ?? DEFAULT_CUSTOMER_SYNC_POLICY
  );
}
