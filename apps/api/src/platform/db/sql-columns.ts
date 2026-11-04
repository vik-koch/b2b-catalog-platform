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
