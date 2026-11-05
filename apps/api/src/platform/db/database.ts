import { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** The connection every query runs on. Without the schema: no query uses
 * drizzle's relational API, so no module needs the tables of every area. */
export type Database = NodePgDatabase;

/** The handle a `db.transaction` callback gets. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The pool or a transaction on it, for a read either may run. */
export type Reader = Pick<Database, 'select'>;
