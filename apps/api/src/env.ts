import { z } from 'zod';

const EnvSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive(),
    DATABASE_URL: z.string().url(),
    // Set by the one-shot tool containers (see compose.yml): "migrate" applies
    // pending migrations, "seed" upserts demo content, "bootstrap-admin" creates
    // the seeded admin if missing. Unset = normal server.
    RUN_MODE: z.enum(['migrate', 'seed', 'bootstrap-admin']).optional(),
    // Bootstrap admin credentials — required only in bootstrap-admin mode (the
    // refinement below). Plaintext is hashed by the one-shot and never stored;
    // the account is created-if-missing, so this is meaningful on first deploy
    // only. The admin rotates it via the app afterwards.
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    // SMTP mail transport. Declared optional but required in server
    // mode by the refinement below — the migrate/seed one-shots never send
    // mail. Dev/demo point these at Mailpit; prod at a real provider.
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: z.coerce.number().int().positive().optional(),
    MAIL_FROM: z.string().optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    MAIL_SECURE: z.enum(['true', 'false']).optional(),
    // Where the inquiry form is delivered (FR-NAV-06).
    MAIL_CONTACT_TO: z.string().optional(),
    // Secret that signs the session JWT. Required in server mode
    // (see refinement below); the migrate/seed one-shots never sign tokens.
    // Min length keeps a weak/short key from being accepted.
    JWT_SECRET: z.string().min(32).optional(),
    // Trusted proxy hops for rate limiting. 0 (default) = trust none,
    // correct for dev/e2e with no proxy; behind Traefik set 1 so the throttler
    // keys on the real client IP. Higher only with more forwarding layers.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    // Filesystem root the LocalMediaStore writes uploaded images to. A
    // mounted volume a small nginx serves at /media/; required in server mode
    // and by the prune-media one-shot (the refinement below enforces that).
    MEDIA_ROOT: z.string().optional(),
    // prune-media one-shot: a file unreferenced and older than this is deleted;
    // the grace window protects an upload not yet saved into a body. Dry-run
    // logs candidates without deleting (observe a first prod run before it acts).
    MEDIA_PRUNE_GRACE_HOURS: z.coerce.number().int().positive().default(24),
    MEDIA_PRUNE_DRY_RUN: z.enum(['true', 'false']).default('false'),
    // The running server sweeps in-process on this cadence (a background timer,
    // not a sidecar — the platform is a single Node process, so one owner of the
    // schedule is correct). The RUN_MODE=prune-media one-shot is the manual door
    // onto the same sweep for a forced or dry-run pass.
    MEDIA_PRUNE_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
    // Login attempts allowed per IP per minute (NFR-SEC-02). The default is the
    // policy for real deployments; it is configurable because the e2e stack
    // drives dozens of logins from one address in well under a minute and would
    // otherwise throttle its own test run. Raise it there, never in prod.
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  })
  .superRefine((val, ctx) => {
    // Only the running server sends mail; require its config there, not on the
    // migrate/seed one-shots.
    if (val.RUN_MODE === undefined) {
      const required = [
        'MAIL_HOST',
        'MAIL_PORT',
        'MAIL_FROM',
        'MAIL_CONTACT_TO',
        'JWT_SECRET',
        'MEDIA_ROOT',
      ] as const;
      for (const key of required) {
        if (val[key] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'required in server mode (RUN_MODE unset)',
          });
        }
      }
    }

    // The bootstrap-admin one-shot needs the credentials to seed; nothing else.
    if (val.RUN_MODE === 'bootstrap-admin') {
      for (const key of ['ADMIN_EMAIL', 'ADMIN_PASSWORD'] as const) {
        if (val[key] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'required in bootstrap-admin mode',
          });
        }
      }
    }
  });

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment variables (copy .env.example to .env at the workspace root):\n${details}`,
  );
}

export const env = parsed.data;
