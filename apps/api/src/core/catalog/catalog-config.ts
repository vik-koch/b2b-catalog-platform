import {
  CATALOG_AREA,
  type CatalogConfig,
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
} from '@b2b-catalog-platform/shared/core/catalog';
import { loadDeploymentConfigBlock } from '../../platform/config/deployment-config';

const loadCatalogConfig = () =>
  loadDeploymentConfigBlock<CatalogConfig>(CATALOG_AREA);

/** The deployment-wide "few left" figure, defaulted. */
export const LOW_STOCK_THRESHOLD_PIECES = 'LOW_STOCK_THRESHOLD_PIECES';

export function loadLowStockThresholdPieces(): number {
  return (
    loadCatalogConfig().lowStockThresholdPieces ??
    DEFAULT_LOW_STOCK_THRESHOLD_PIECES
  );
}

/** Whether an unsatisfied pairing refuses the order (FR-SET-04). */
export const PAIRINGS_ENFORCED = 'PAIRINGS_ENFORCED';

export function loadPairingsEnforced(): boolean {
  return loadCatalogConfig().pairingsEnforced;
}
