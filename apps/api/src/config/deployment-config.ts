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
     * The company registration number's format. Jurisdiction-specific, so it
     * lives here rather than in the shared contract, and the API applies it as
     * well as the browser — a rule enforced only client-side is not a rule.
     */
    companyIdInput: z
      .object({
        pattern: z.string(),
        mask: z.string().optional(),
        example: z.string().optional(),
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
 * Validates a company registration number against the deployment's own pattern.
 * A deployment that configures no pattern gets no format rule — the contract's
 * envelope (present, trimmed, length-capped, alphanumeric) still applies.
 *
 * The pattern comes from a file the deployment owner wrote, so it is trusted —
 * but it is still compiled at runtime against user input, so it must be
 * anchored and short. An unanchored or oversized pattern is a configuration
 * error and fails the boot rather than being silently ignored.
 */
export const COMPANY_ID_RULE = 'COMPANY_ID_RULE';

export type CompanyIdRule = (value: string) => boolean;

export function loadCompanyIdRule(): CompanyIdRule {
  const configured = loadApiDeploymentConfig().companyIdInput;
  if (!configured) {
    return () => true;
  }

  const { pattern } = configured;
  if (pattern.length > 200) {
    throw new Error('companyIdInput.pattern is too long (max 200 characters)');
  }
  if (!pattern.startsWith('^') || !pattern.endsWith('$')) {
    throw new Error(
      'companyIdInput.pattern must be anchored with ^ and $ so it matches the whole value',
    );
  }

  const regex = new RegExp(pattern);
  return (value: string) => regex.test(value);
}
