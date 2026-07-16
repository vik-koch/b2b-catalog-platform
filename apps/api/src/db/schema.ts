import { pgTable, varchar } from 'drizzle-orm/pg-core';

export const helloWorld = pgTable('helloWorld', {
  message: varchar('message', { length: 255 }).notNull(),
});
