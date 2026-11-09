import { defineConfig } from 'drizzle-kit';

import { env } from './src/platform/env';

export default defineConfig({
  schema: './src/app/app.schema.ts',
  out: './src/platform/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
