import { z } from 'zod';

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().url(),
  // Set by the one-shot tool containers (see compose.yml): "migrate" applies
  // pending migrations, "seed" upserts seed data. Unset = normal server.
  RUN_MODE: z.enum(['migrate', 'seed']).optional(),
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
