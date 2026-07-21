import { z } from 'zod';

const EnvSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive(),
    DATABASE_URL: z.string().url(),
    // Set by the one-shot tool containers (see compose.yml): "migrate" applies
    // pending migrations, "seed" upserts seed data. Unset = normal server.
    RUN_MODE: z.enum(['migrate', 'seed']).optional(),
    // SMTP mail transport (ADR 0013). Declared optional but required in server
    // mode by the refinement below — the migrate/seed one-shots never send
    // mail. Dev/demo point these at Mailpit; prod at a real provider.
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: z.coerce.number().int().positive().optional(),
    MAIL_FROM: z.string().optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    MAIL_SECURE: z.enum(['true', 'false']).optional(),
  })
  .superRefine((val, ctx) => {
    // Only the running server sends mail; require its config there, not on the
    // migrate/seed one-shots.
    if (val.RUN_MODE === undefined) {
      for (const key of ['MAIL_HOST', 'MAIL_PORT', 'MAIL_FROM'] as const) {
        if (val[key] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'required in server mode (RUN_MODE unset)',
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
