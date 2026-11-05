import type * as z from 'zod';
import {
  type DeliveryConfig,
  ORDERING_AREA,
  type OrderReferenceConfig,
  type orderingConfigShape,
} from '@b2b-catalog-platform/shared/core/ordering';
import { loadDeploymentConfigBlock } from '../../platform/config/deployment-config';

/** Parsed, not read-only, as the API's services are typed by the schemas. */
type OrderingConfig = z.infer<z.ZodObject<typeof orderingConfigShape>>;

const loadOrderingConfig = () =>
  loadDeploymentConfigBlock<OrderingConfig>(ORDERING_AREA);

/** Whether an order carries an invoice address of its own. */
export const BILLING_ADDRESS_ENABLED = 'BILLING_ADDRESS_ENABLED';

export function loadBillingAddressEnabled(): boolean {
  return loadOrderingConfig().billingAddressEnabled;
}

/** The collection points, as the order service needs them: what a key must
 * match, and what an order snapshots when it does. */
export const PICKUP_LOCATIONS = 'PICKUP_LOCATIONS';

export interface PickupLocation {
  key: string;
  name: string;
  address: string;
}

export function loadPickupLocations(): readonly PickupLocation[] {
  return loadOrderingConfig().pickup?.locations ?? [];
}

/** The delivery zones, first match wins; with none, no address has a zone. */
export const DELIVERY_CONFIG = 'DELIVERY_CONFIG';

export function loadDeliveryConfig(): DeliveryConfig | undefined {
  return loadOrderingConfig().delivery;
}

/** Defaulted: a deployment that says nothing takes orders as `ORD`. */
export const ORDER_REFERENCE_CONFIG = 'ORDER_REFERENCE_CONFIG';

export function loadOrderReferenceConfig(): OrderReferenceConfig {
  return loadOrderingConfig().orderReference ?? { prefix: 'ORD' };
}
