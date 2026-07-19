import { pgTable, varchar, text } from 'drizzle-orm/pg-core';

export const helloWorld = pgTable('helloWorld', {
  message: varchar('message', { length: 255 }).notNull(),
});

export const page = pgTable('page', {
  // The primary key IS the public slug (fixed set, see shared PAGE_SLUGS).
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  bodyHtml: text('bodyHtml').notNull(),
});
