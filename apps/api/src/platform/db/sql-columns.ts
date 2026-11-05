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
 * A closed set of string values, as a check constraint rather than a pgEnum.
 *
 * Migrations run as one transaction (`migrate.ts`), and Postgres forbids *using*
 * an enum value added in the same transaction — so a later migration that adds
 * a status and then references it would fail on a fresh database and pass on an
 * incrementally migrated one. A check is dropped and recreated freely; an enum
 * value can never be removed at all.
 *
 * Raw rather than parameterized: these are the contract's own constants, and a
 * bound parameter would land in the generated migration as a placeholder.
 */
export function oneOf(column: string, values: readonly string[]) {
  const list = values.map((value) => `'${value}'`).join(', ');
  return sql.raw(`"${column}" in (${list})`);
}
