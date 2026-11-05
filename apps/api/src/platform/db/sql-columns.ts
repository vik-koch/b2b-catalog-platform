import { getTableName, SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';

/** `"table"."column"`, or under an alias: an `sql` template writes a column
 * bare, so a correlated reference would bind inside the subquery's scope. */
export function qualified(
  column: PgColumn,
  alias = getTableName(column.table),
): SQL {
  return sql`${sql.identifier(alias)}.${sql.identifier(column.name)}`;
}

/** The value an upsert tried to write, for its `do update set`. */
export function excluded(column: PgColumn): SQL {
  return sql`excluded.${sql.identifier(column.name)}`;
}

/**
 * A closed set of strings as a check, not an enum. Migrations run as one
 * transaction, and Postgres refuses to use an enum value added in the same
 * one: a migration adding a status and using it would fail on a fresh
 * database only. A check is recreated freely; an enum value never goes.
 *
 * Raw, not bound: these are the contract's constants, and a parameter would
 * land in the migration as a placeholder.
 */
export function oneOf(column: string, values: readonly string[]) {
  const list = values.map((value) => `'${value}'`).join(', ');
  return sql.raw(`"${column}" in (${list})`);
}
