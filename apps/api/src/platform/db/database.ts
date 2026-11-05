import { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** The connection every query runs on. Without the schema: no query uses
 * drizzle's relational API, so no module needs the tables of every area. */
export type Database = NodePgDatabase;
