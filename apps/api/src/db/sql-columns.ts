import { getTableName, SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';

/**
 * `"table"."column"`, or `"alias"."column"` under a hand-written alias — an
 * unambiguous reference inside a raw subquery. Inside an `sql` template
 * drizzle writes a column bare, so a correlated reference left unqualified
 * binds to whatever the subquery's own scope happens to offer. The name still
 * comes from the schema, so a renamed column cannot be left behind here.
 */
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
