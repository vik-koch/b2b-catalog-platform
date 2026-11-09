import {
  CATALOG_AREA,
  catalogConfigShape,
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
  type TaxConfig,
} from '@b2b-catalog-platform/shared/core/catalog';
import * as z from 'zod';
import { loadDeploymentConfigBlock } from '../../platform/config/deployment-config';

const loadCatalogConfig = () =>
  loadDeploymentConfigBlock(
    CATALOG_AREA,
    z.object(catalogConfigShape).strict(),
  );

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

/** The tax basis, and the default a product's own rate falls back to. */
export const TAX_CONFIG = 'TAX_CONFIG';

export function loadTaxConfig(): TaxConfig {
  return loadCatalogConfig().tax;
}
