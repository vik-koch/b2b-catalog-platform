import {
  AddressConfig,
  addressConfigSchema,
  CompanyIdFormat,
  companyIdInputSchema,
  DeliveryConfig,
  deliveryConfigSchema,
  OrderReferenceConfig,
  orderReferenceConfigSchema,
  PhoneConfig,
} from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';

/**
 * The slice of the deployment config the **API** needs. The web app validates
 * that same mounted file whole (apps/web config/deployment-config.type.ts);
 * this schema is deliberately narrow and non-strict, because the API neither
 * knows nor cares about the chrome, pages and map keys living beside these.
 */
export const apiDeploymentConfigSchema = z
  .object({
    /** Mail branding: who a message is from, and in what colour. */
    branding: z
      .object({
        name: z.string(),
        theme: z.object({ primary: z.string() }),
      })
      // Non-strict for the same reason: `title`, `startYear` and the rest
      // belong to the web app, and a key added there must not fail the API.
      .passthrough(),
    /**
     * The shapes a company ID may take. Jurisdiction-specific,
     * so it lives here rather than in the shared contract, and the API applies
     * them as well as the browser — a rule enforced only client-side is not a
     * rule. The schema is the shared one, so the two apps cannot drift about
     * what a format is or which ones are coherent.
     */
    companyIdInput: companyIdInputSchema.optional(),
    /**
     * How this deployment groups a phone number. Numbers are stored unmasked,
     * so the API needs the mask for the same reason the browser does: a staff
     * notification has to be readable by whoever it wakes up.
     */
    phoneInput: z
      .object({
        countryCode: z.string(),
        mask: z.string().optional(),
      })
      .passthrough()
      .optional(),
    /**
     * Where the deployment ships. The API applies the country list as well as
     * the browser — a `<select>` is an entry aid, not a rule.
     */
    address: addressConfigSchema.optional(),
    /**
     * The offices an order may be collected from. The API validates a submitted
     * pickup key against this list and snapshots the office's name and address
     * onto the order, so a later rename leaves past orders readable. The map
     * embed beside them is the web app's business, hence the passthrough.
     */
    locations: z
      .array(
        z
          .object({
            key: z.string().min(1),
            name: z.string(),
            description: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    /**
     * Delivery zones (FR-CART-11). The server re-derives the zone from the
     * submitted address rather than trusting the browser's — a free-delivery
     * threshold is not something a customer picks.
     */
    delivery: deliveryConfigSchema.optional(),
    /** The order reference's prefix and the timezone its date is read in. */
    orderReference: orderReferenceConfigSchema.optional(),
    /**
     * The currency an order is priced in, snapshotted onto it: this key is
     * editable, and an old order must keep saying what it was priced in.
     */
    catalog: z
      .object({
        currency: z.object({ code: z.string() }).passthrough(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ApiDeploymentConfig = z.infer<typeof apiDeploymentConfigSchema>;

/**
 * Read once per process: the mounted file is immutable for the container's
 * lifetime. A bad or missing file throws at boot, from the module factories
 * that call this.
 */
let cached: ApiDeploymentConfig | undefined;
export function loadApiDeploymentConfig(): ApiDeploymentConfig {
  return (cached ??= loadConfig(
    apiDeploymentConfigSchema,
    'DEPLOYMENT_CONFIG_FILE',
  ) as ApiDeploymentConfig);
}

/** Test seam: drops the memoized config so a spec can load a different file. */
export function resetApiDeploymentConfig(): void {
  cached = undefined;
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

/** The pickup offices, as the order service needs them. */
export const PICKUP_LOCATIONS = 'PICKUP_LOCATIONS';

export interface PickupLocation {
  key: string;
  name: string;
  description?: string;
}

export function loadPickupLocations(): readonly PickupLocation[] {
  return loadApiDeploymentConfig().locations ?? [];
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
