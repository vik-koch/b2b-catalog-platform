import { pgTable, text, varchar } from 'drizzle-orm/pg-core';

export const page = pgTable('page', {
  // The primary key IS the public slug (fixed set, see shared PAGE_SLUGS).
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  bodyHtml: text('bodyHtml').notNull(),
});
