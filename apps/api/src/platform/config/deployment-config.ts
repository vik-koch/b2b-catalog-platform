/**
 * `deployment.json` and `api.json`, read once at boot. Each part a service
 * needs is provided under a token, so a spec hands one over without a file.
 */
import {
  companyIdMatchesAny,
  KeyboardLayout,
  CompanyIdFormat,
  normalizePhone,
  PhoneConfig,
  deploymentConfigSchema,
  MoneyFormat,
  moneyFormat,
  shopTimeZone,
  TaxConfig,
} from '@b2b-catalog-platform/shared/platform';
import { configPath, loadConfig } from '@b2b-catalog-platform/shared/node';
import { DEFAULT_SESSION_IDLE_DAYS } from '../auth/session-config';
import { join } from 'node:path';
import { loadApiConfig } from './api-config';
import type * as z from 'zod';

/** The parsed value, not the read-only view the web injects: services are
 * typed by the shared schemas. */
type ApiDeploymentConfig = z.infer<typeof deploymentConfigSchema>;

/** An area's block is read through the area's own loader. */
type UnclaimedDeploymentConfig = Omit<
  ApiDeploymentConfig,
  'site' | 'catalog' | 'accounts' | 'ordering'
>;

let cached: ApiDeploymentConfig | undefined;
function loadWhole(): ApiDeploymentConfig {
  return (cached ??= loadConfig(
    deploymentConfigSchema,
    'deployment.json',
  ) as ApiDeploymentConfig);
}

export function loadApiDeploymentConfig(): UnclaimedDeploymentConfig {
  return loadWhole();
}

/** An area's block, checked with the whole file on first read. */
export function loadDeploymentConfigBlock<T>(area: string): T {
  return (loadWhole() as unknown as Record<string, T>)[area];
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

/** The tax basis, and the default a product's own rate falls back to. */
export const TAX_CONFIG = 'TAX_CONFIG';

export function loadTaxConfig(): TaxConfig {
  return loadApiDeploymentConfig().tax;
}

/** The phone grouping, for the mails that quote a number to staff. */
export const PHONE_INPUT = 'PHONE_INPUT';

export function loadPhoneInput(): PhoneConfig | undefined {
  return loadApiDeploymentConfig().phoneInput;
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

/** The shop's own day, in mails, PDFs and order references. */
export const SHOP_TIME_ZONE = 'SHOP_TIME_ZONE';

export function loadShopTimeZone(): string {
  return shopTimeZone(loadApiDeploymentConfig());
}

/** The currency code an order is priced in. */
export const ORDER_CURRENCY = 'ORDER_CURRENCY';

export function loadOrderCurrency(): string {
  return loadApiDeploymentConfig().currency.code;
}

/** The currency in the deployment's locale, for the order mails and PDF. */
export const MONEY_FORMAT = 'MONEY_FORMAT';

export function loadMoneyFormat(): MoneyFormat {
  return moneyFormat(loadApiDeploymentConfig());
}

/** The second keyboard layout searches read a query on, or null for none. */
export const ALTERNATE_LAYOUT = 'ALTERNATE_LAYOUT';

export function loadAlternateLayout(): KeyboardLayout | null {
  return loadApiDeploymentConfig().search?.alternateLayout ?? null;
}
