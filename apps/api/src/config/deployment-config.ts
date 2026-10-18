import {
  AddressConfig,
  CompanyIdFormat,
  CONSENT_PURPOSES,
  ConsentPurpose,
  CustomerSyncPolicy,
  DEFAULT_CUSTOMER_SYNC_POLICY,
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
  DEFAULT_SESSION_IDLE_DAYS,
  DEFAULT_SYNC_POLICY,
  DeliveryConfig,
  deploymentConfigSchema,
  KeyboardLayout,
  MoneyFormat,
  moneyFormat,
  normalizePhone,
  OrderReferenceConfig,
  PhoneConfig,
  RetentionConfig,
  SignInStepConfig,
  SyncPolicy,
  TaxConfig,
} from '@b2b-catalog-platform/shared';
import { join } from 'node:path';
import { configPath, loadConfig } from '@b2b-catalog-platform/shared/node';
import { loadApiConfig } from './api-config';
import type * as z from 'zod';

/**
 * `deployment.json`, read whole and as strictly as the web reads it — one
 * schema for both, so a misspelled key stops either. What only the API needs
 * is in `api.json` (api-config.ts).
 *
 * Typed as the parsed value, not the read-only view the web injects: the
 * loaders below hand its parts to services typed by the shared schemas.
 *
 * Read once per process: the mounted file is immutable for the container's
 * lifetime. A bad or missing file throws at boot, from the module factories
 * that call this.
 */
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

/**
 * Where a deployment's own assets live: the `assets/` directory of the
 * mounted config, which is the layout config/README.md documents and the one
 * the web server already serves from. Derived rather than given its own variable —
 * one mount, one place, and nothing to keep in step.
 */
export const PDF_FONT = 'PDF_FONT';

export interface PdfFontFiles {
  readonly regular: string;
  readonly bold: string;
}

export function loadPdfFont(): PdfFontFiles | undefined {
  const pdf = loadApiDeploymentConfig().branding.font?.pdf;
  if (!pdf) return undefined;
  const assets = configPath('assets');
  // A path out of the assets directory is a configuration mistake, not an
  // attack — the file is the operator's own — but the boot is where a mistake
  // should be noticed rather than the first time somebody asks for a PDF.
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

/**
 * Whether orders carry an invoice address of its own. Injected rather than
 * read where it is used, like the rules beside it.
 */
export const BILLING_ADDRESS_ENABLED = 'BILLING_ADDRESS_ENABLED';

export function loadBillingAddressEnabled(): boolean {
  return loadApiDeploymentConfig().billingAddressEnabled;
}

/** Whether the deployment publishes terms of sale, which an order then
 * records the version of (NFR-LEGAL-10). */
export const TERMS_PUBLISHED = 'TERMS_PUBLISHED';

export function loadTermsPublished(): boolean {
  return loadApiDeploymentConfig().pages.published.includes('terms');
}

/** Whether the receipt attaches the accepted terms as a document. */
export const TERMS_ATTACHED = 'TERMS_ATTACHED';

export function loadTermsAttached(): boolean {
  return loadApiConfig().terms.attachToReceipt;
}

/** The tax basis and default rate, which a product's own rate falls back
 * to. Injected like the rules beside it. */
export const TAX_CONFIG = 'TAX_CONFIG';

export function loadTaxConfig(): TaxConfig {
  return loadApiDeploymentConfig().tax;
}

/** How long consent and destruction records are kept before the sweep. */
export const RETENTION = 'RETENTION';

export function loadRetention(): RetentionConfig {
  return loadApiConfig().retention;
}

/**
 * The deployment's phone grouping, for the mails that quote a number back at
 * staff. Injected rather than read where it is used, so a spec can hand over a
 * mask without a config file — the same shape as COMPANY_ID_RULE below.
 */
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

/**
 * Reads an entered phone number into its stored form, or answers `null` where
 * the deployment's rule cannot read it. Applied on the server as well as in the
 * browser, because a code can only be sent to a number in one known form
 * (FR-AUTH-12). See `storedPhone` for how a refusal is raised.
 */
export const PHONE_RULE = 'PHONE_RULE';

export type PhoneRule = (value: string) => string | null;

export function loadPhoneRule(): PhoneRule {
  const config = loadApiDeploymentConfig().phoneInput;
  return (value) => normalizePhone(value, config);
}

/**
 * Validates a company ID against the deployment's own formats.
 * **Any** of them is enough — that is what several accepted shapes means — and
 * the API takes no interest in which one the browser's picker was set to: the
 * picker is an entry aid, the patterns are the rule.
 *
 * A deployment that configures no formats gets no format rule; the contract's
 * envelope (present, trimmed, length-capped, alphanumeric) still applies.
 *
 * Patterns come from a file the deployment owner wrote, so they are trusted —
 * but they are still compiled at runtime against user input, so each must be
 * anchored and short. That is checked when the config is parsed, so a bad one
 * fails the boot rather than being silently ignored here.
 */
export const COMPANY_ID_RULE = 'COMPANY_ID_RULE';

export type CompanyIdRule = (value: string) => boolean;

/**
 * The formats themselves, for the one caller that needs to tell them apart
 * rather than just accept or refuse: the account list's "which shape" filter.
 */
export const COMPANY_ID_FORMATS = 'COMPANY_ID_FORMATS';

export function loadCompanyIdFormats(): readonly CompanyIdFormat[] {
  return loadApiDeploymentConfig().companyIdInput?.formats ?? [];
}

/**
 * The address rules, injected rather than read where they are used — the same
 * shape as PHONE_INPUT and COMPANY_ID_RULE, so a spec can hand over a country
 * list without a config file.
 */
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

/** The delivery zones, first match wins. Empty where none are configured,
 * which resolves every address to no zone at all — a normal answer. */
export const DELIVERY_CONFIG = 'DELIVERY_CONFIG';

export function loadDeliveryConfig(): DeliveryConfig | undefined {
  return loadApiDeploymentConfig().delivery;
}

/**
 * How order references read. Defaulted rather than required: a deployment that
 * says nothing still takes orders, under a neutral prefix and UTC.
 */
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
  return loadApiDeploymentConfig().catalog?.currency.code ?? 'EUR';
}

/**
 * The same currency, in the deployment's locale — what the order mails, the
 * PDFs and the sync notices format amounts and dates against.
 */
export const MONEY_FORMAT = 'MONEY_FORMAT';

export function loadMoneyFormat(): MoneyFormat {
  return moneyFormat(loadApiDeploymentConfig());
}

/**
 * The deployment-wide "few left" figure. Defaulted rather than required: a
 * deployment that tracks no stock never reaches it, and one that does is not
 * asked to configure a number before its first badge can appear.
 */
export const LOW_STOCK_THRESHOLD_PIECES = 'LOW_STOCK_THRESHOLD_PIECES';

export function loadLowStockThresholdPieces(): number {
  return (
    loadApiDeploymentConfig().catalog?.lowStockThresholdPieces ??
    DEFAULT_LOW_STOCK_THRESHOLD_PIECES
  );
}

/**
 * Whether an unsatisfied pairing refuses the order (FR-SET-04). Injected rather
 * than read where it is used, like the rules beside it, so a spec can hand over
 * either answer without a config file.
 */
export const PAIRINGS_ENFORCED = 'PAIRINGS_ENFORCED';

/**
 * The ceilings an automated run is judged against (ADR 0055). Injected like
 * the rules beside it, so a spec can hand over a policy without a config file.
 */
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

/**
 * Which consent purposes this deployment asks for: those switched on.
 * Injected like the rules beside it.
 */
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

export function loadPairingsEnforced(): boolean {
  return loadApiDeploymentConfig().catalog?.pairingsEnforced ?? false;
}

export function loadCompanyIdRule(): CompanyIdRule {
  const configured = loadApiDeploymentConfig().companyIdInput;
  if (!configured) {
    return () => true;
  }

  const patterns = configured.formats.map(
    (format) => new RegExp(format.pattern),
  );
  return (value: string) => patterns.some((pattern) => pattern.test(value));
}
