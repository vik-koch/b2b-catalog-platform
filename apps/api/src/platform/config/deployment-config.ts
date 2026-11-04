/**
 * `deployment.json` and `api.json`, read once at boot. Each part a service
 * needs is provided under a token, so a spec hands one over without a file.
 */
import {
  DeliveryConfig,
  OrderReferenceConfig,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  CONSENT_PURPOSES,
  ConsentPurpose,
} from '@b2b-catalog-platform/shared/core/site';
import { DEFAULT_LOW_STOCK_THRESHOLD_PIECES } from '@b2b-catalog-platform/shared/core/catalog';
import {
  companyIdMatchesAny,
  KeyboardLayout,
  CompanyIdFormat,
  normalizePhone,
  PhoneConfig,
  deploymentConfigSchema,
  MoneyFormat,
  moneyFormat,
  TaxConfig,
} from '@b2b-catalog-platform/shared/platform';
import {
  CustomerSyncPolicy,
  DEFAULT_CUSTOMER_SYNC_POLICY,
  DEFAULT_SYNC_POLICY,
  SyncPolicy,
} from '@b2b-catalog-platform/shared/core/exchange';
import { configPath, loadConfig } from '@b2b-catalog-platform/shared/node';
import { DEFAULT_SESSION_IDLE_DAYS } from '../auth/session-config';
import { RetentionConfig } from '../../core/retention/retention-config';
import { join } from 'node:path';
import { loadApiConfig } from './api-config';
import type * as z from 'zod';
import {
  CustomerType,
  AddressConfig,
  SignInStepConfig,
} from '@b2b-catalog-platform/shared/core/accounts';

/** The parsed value, not the read-only view the web injects: services are
 * typed by the shared schemas. */
type ApiDeploymentConfig = z.infer<typeof deploymentConfigSchema>;

let cached: ApiDeploymentConfig | undefined;
export function loadApiDeploymentConfig(): ApiDeploymentConfig {
  return (cached ??= loadConfig(
    deploymentConfigSchema,
    'deployment.json',
  ) as ApiDeploymentConfig);
}

/** Test seam: drops the memoized config so a spec can load a different file. */
export function resetApiDeploymentConfig(): void {
  cached = undefined;
}

/** The PDF faces' paths, in the config's `assets/` directory. */
export const PDF_FONT = 'PDF_FONT';

export interface PdfFontFiles {
  readonly regular: string;
  readonly bold: string;
}

export function loadPdfFont(): PdfFontFiles | undefined {
  const pdf = loadApiDeploymentConfig().branding.font?.pdf;
  if (!pdf) return undefined;
  const assets = configPath('assets');
  // An operator's mistake, not an attack: caught at boot, not at the first PDF.
  const resolve = (name: string): string => {
    const path = join(assets, name);
    if (!path.startsWith(`${assets}/`)) {
      throw new Error(
        `branding.font.pdf: ${name} is outside the assets directory`,
      );
    }
    return path;
  };
  return { regular: resolve(pdf.regular), bold: resolve(pdf.bold) };
}

/** Whether an order carries an invoice address of its own. */
export const BILLING_ADDRESS_ENABLED = 'BILLING_ADDRESS_ENABLED';

export function loadBillingAddressEnabled(): boolean {
  return loadApiDeploymentConfig().billingAddressEnabled;
}

/** Published terms, whose version an order records (NFR-LEGAL-10). */
export const TERMS_PUBLISHED = 'TERMS_PUBLISHED';

export function loadTermsPublished(): boolean {
  return loadApiDeploymentConfig().pages.published.includes('terms');
}

/** Whether the receipt attaches the accepted terms as a document. */
export const TERMS_ATTACHED = 'TERMS_ATTACHED';

export function loadTermsAttached(): boolean {
  return loadApiConfig().terms.attachToReceipt;
}

/** The tax basis, and the default a product's own rate falls back to. */
export const TAX_CONFIG = 'TAX_CONFIG';

export function loadTaxConfig(): TaxConfig {
  return loadApiDeploymentConfig().tax;
}

/** How long consent and destruction records are kept before the sweep. */
export const RETENTION = 'RETENTION';

export function loadRetention(): RetentionConfig {
  return loadApiConfig().retention;
}

/** The phone grouping, for the mails that quote a number to staff. */
export const PHONE_INPUT = 'PHONE_INPUT';

export function loadPhoneInput(): PhoneConfig | undefined {
  return loadApiDeploymentConfig().phoneInput;
}

export function loadSignInStep(): SignInStepConfig | undefined {
  return loadApiDeploymentConfig().signInStep;
}

export function loadSessionIdleDays(): number {
  return loadApiConfig().session?.idleDays ?? DEFAULT_SESSION_IDLE_DAYS;
}

/** A typed number's stored form, or null where the rule cannot read it: a
 * code is sent only to a number in one known form (FR-AUTH-12). */
export const PHONE_RULE = 'PHONE_RULE';

export type PhoneRule = (value: string) => string | null;

export function loadPhoneRule(): PhoneRule {
  const config = loadApiDeploymentConfig().phoneInput;
  return (value) => normalizePhone(value, config);
}

/** Whether a company ID fits any configured format; the picker's choice is
 * an entry aid, not the rule. */
export const COMPANY_ID_RULE = 'COMPANY_ID_RULE';

export type CompanyIdRule = (value: string) => boolean;

export function loadCompanyIdRule(): CompanyIdRule {
  const formats = loadApiDeploymentConfig().companyIdInput?.formats;
  return (value) => companyIdMatchesAny(value, formats);
}

/** The formats themselves, for the account list's "which format" filter. */
export const COMPANY_ID_FORMATS = 'COMPANY_ID_FORMATS';

export function loadCompanyIdFormats(): readonly CompanyIdFormat[] {
  return loadApiDeploymentConfig().companyIdInput?.formats ?? [];
}

/** The kinds of customer the shop sells to (FR-AUTH-13), wherever an account
 * or an order is written. */
export const ACCEPTED_CUSTOMER_TYPES = 'ACCEPTED_CUSTOMER_TYPES';

export function loadAcceptedCustomerTypes(): readonly CustomerType[] {
  return loadApiDeploymentConfig().customerTypes;
}

export const ADDRESS_CONFIG = 'ADDRESS_CONFIG';

export function loadAddressConfig(): AddressConfig | undefined {
  return loadApiDeploymentConfig().address;
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
  return loadApiDeploymentConfig().pickup?.locations ?? [];
}

/** The delivery zones, first match wins; with none, no address has a zone. */
export const DELIVERY_CONFIG = 'DELIVERY_CONFIG';

export function loadDeliveryConfig(): DeliveryConfig | undefined {
  return loadApiDeploymentConfig().delivery;
}

/** Defaulted: a deployment that says nothing takes orders as `ORD`, in UTC. */
export const ORDER_REFERENCE_CONFIG = 'ORDER_REFERENCE_CONFIG';

export function loadOrderReferenceConfig(): OrderReferenceConfig {
  return (
    loadApiDeploymentConfig().orderReference ?? {
      prefix: 'ORD',
      timezone: 'UTC',
    }
  );
}

/** The currency code an order is priced in. */
export const ORDER_CURRENCY = 'ORDER_CURRENCY';

export function loadOrderCurrency(): string {
  return loadApiDeploymentConfig().catalog.currency.code;
}

/** The currency in the deployment's locale, for the order mails and PDF. */
export const MONEY_FORMAT = 'MONEY_FORMAT';

export function loadMoneyFormat(): MoneyFormat {
  return moneyFormat(loadApiDeploymentConfig());
}

/** The deployment-wide "few left" figure, defaulted. */
export const LOW_STOCK_THRESHOLD_PIECES = 'LOW_STOCK_THRESHOLD_PIECES';

export function loadLowStockThresholdPieces(): number {
  return (
    loadApiDeploymentConfig().catalog.lowStockThresholdPieces ??
    DEFAULT_LOW_STOCK_THRESHOLD_PIECES
  );
}

/** Whether an unsatisfied pairing refuses the order (FR-SET-04). */
export const PAIRINGS_ENFORCED = 'PAIRINGS_ENFORCED';

export function loadPairingsEnforced(): boolean {
  return loadApiDeploymentConfig().catalog.pairingsEnforced;
}

/** The ceilings an automated catalog run is judged against. */
export const SYNC_POLICY = 'SYNC_POLICY';

export function loadSyncPolicy(): SyncPolicy {
  return loadApiConfig().sync?.autoApply ?? DEFAULT_SYNC_POLICY;
}

/** The customer exchange's own ceilings (FR-ADM-11). */
export const CUSTOMER_SYNC_POLICY = 'CUSTOMER_SYNC_POLICY';

export function loadCustomerSyncPolicy(): CustomerSyncPolicy {
  return (
    loadApiConfig().sync?.customerAutoApply ?? DEFAULT_CUSTOMER_SYNC_POLICY
  );
}

/** The consent purposes switched on. */
export const CONSENT_PURPOSES_ASKED = 'CONSENT_PURPOSES_ASKED';

export function loadConsentPurposesAsked(): readonly ConsentPurpose[] {
  const { consent } = loadApiDeploymentConfig();
  return CONSENT_PURPOSES.filter((purpose) => consent[purpose]);
}

/** The second keyboard layout searches read a query on, or null for none. */
export const ALTERNATE_LAYOUT = 'ALTERNATE_LAYOUT';

export function loadAlternateLayout(): KeyboardLayout | null {
  return loadApiDeploymentConfig().search?.alternateLayout ?? null;
}
