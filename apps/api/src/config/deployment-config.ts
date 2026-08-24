import {
  AddressConfig,
  addressConfigSchema,
  CompanyIdFormat,
  companyIdInputSchema,
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
