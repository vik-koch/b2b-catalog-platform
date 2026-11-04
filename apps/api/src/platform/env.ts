import * as z from 'zod';
import { emailField } from '@b2b-catalog-platform/shared/platform';

/** Treats an empty variable as an unset one, then applies the schema. */
const emptyAsUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

const EnvSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive(),
    DATABASE_URL: z.url(),
    // The one-shot containers: "migrate", or "bootstrap-admin", which creates
    // the first admin if missing. Unset is the server.
    RUN_MODE: z.enum(['migrate', 'bootstrap-admin']).optional(),
    // The bootstrap admin, required in that mode only. The app's own email
    // rule: an address registration accepts must not stop the boot.
    ADMIN_EMAIL: emailField(320).optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    // Off for a stack reset to a seed bundle, which recreates the account on
    // every reset and would ask again each time.
    ADMIN_FORCE_PASSWORD_CHANGE: z.enum(['true', 'false']).default('true'),
    // SMTP, required in server mode: the one-shots never send mail.
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: z.coerce.number().int().positive().optional(),
    MAIL_FROM: z.string().optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    MAIL_SECURE: z.enum(['true', 'false']).optional(),
    // The staff inbox: inquiries (FR-NAV-06) and new registrations
    // (FR-NOTIF-04), both a person answering customers.
    MAIL_STAFF_TO: z.string().optional(),
    // The person who runs the shop: runs to decide, runs that broke. An
    // address, not "every admin", so it works before an admin exists; never
    // MAIL_STAFF_TO, the inbox customers write to.
    MAIL_ADMIN_TO: z.string().optional(),
    // A second copy of the fault mails only; Grafana's alerting reads it too.
    MAIL_OPS_TO: z.string().optional(),
    // `inline` sends before the request returns, for the e2e suite, whose
    // assertions on which mails a move sends would otherwise race the queue.
    // Never in a deployment.
    MAIL_DELIVERY: z.enum(['queued', 'inline']).default('queued'),
    // The public origin, for the absolute links mail needs. Server mode.
    APP_ORIGIN: z.url().optional(),
    // Signs the session JWT. Server mode.
    JWT_SECRET: z.string().min(32).optional(),
    // Proxy hops to trust for the client IP: 1 behind Traefik, 0 without one.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    // Where LocalMediaStore writes. Server mode.
    MEDIA_ROOT: z.string().optional(),
    // An unreferenced file younger than this survives, as an upload may not
    // be saved into a body yet.
    MEDIA_PRUNE_GRACE_HOURS: z.coerce.number().int().positive().default(24),
    MEDIA_PRUNE_DRY_RUN: z.enum(['true', 'false']).default('false'),
    MEDIA_PRUNE_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
    // Per IP per minute (NFR-SEC-02). Only the e2e stack raises these: it
    // signs in and posts forms from one address dozens of times a minute.
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    PUBLIC_FORM_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    // Set, addresses and companies are suggested; unset, both are typed. Not
    // in deployment.json, which every page carries. Logged at boot.
    SUGGESTION_SIDECAR_URL: emptyAsUndefined(z.url()),
    // The sidecar that proves the number at sign-in (FR-AUTH-12): one sending
    // codes or one running call checks, at most one. With neither, mail
    // stands in: fine for dev, no second factor. Logged at boot.
    SIGN_IN_CODE_URL: emptyAsUndefined(z.url()),
    SIGN_IN_CALL_URL: emptyAsUndefined(z.url()),
    // Sent as a bearer token, so the sidecar knows the platform's calls.
    SIGN_IN_CODE_TOKEN: emptyAsUndefined(z.string().min(16)),
    SIGN_IN_CALL_TOKEN: emptyAsUndefined(z.string().min(16)),
    // What mail stands in for: `call` exercises the call screen without one.
    SIGN_IN_MAIL_KIND: z.enum(['code', 'call']).default('code'),
    // Shown in the admin panel. Stamped on by deploy.sh, as a release retags
    // the image main built. Compose passes "" on an undeployed stack.
    APP_VERSION: emptyAsUndefined(z.string().min(1)),
    APP_DEPLOYED_AT: emptyAsUndefined(z.iso.datetime()),
  })
  .superRefine((val, ctx) => {
    if (val.RUN_MODE === undefined) {
      const required = [
        'MAIL_HOST',
        'MAIL_PORT',
        'MAIL_FROM',
        'MAIL_STAFF_TO',
        'MAIL_ADMIN_TO',
        'APP_ORIGIN',
        'JWT_SECRET',
        'MEDIA_ROOT',
      ] as const;
      for (const key of required) {
        if (val[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required in server mode (RUN_MODE unset)',
          });
        }
      }
    }

    // One provider proves the number, so one kind of step is owed.
    if (val.SIGN_IN_CODE_URL && val.SIGN_IN_CALL_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SIGN_IN_CALL_URL'],
        message: 'set either SIGN_IN_CODE_URL or SIGN_IN_CALL_URL, not both',
      });
    }

    if (val.RUN_MODE === 'bootstrap-admin') {
      for (const key of ['ADMIN_EMAIL', 'ADMIN_PASSWORD'] as const) {
        if (val[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
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
