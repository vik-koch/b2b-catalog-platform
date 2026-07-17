import { z } from 'zod';

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().url(),
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
