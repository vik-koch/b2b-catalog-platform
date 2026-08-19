import { drizzle } from 'drizzle-orm/node-postgres';
import { and } from 'drizzle-orm';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import { attributeFilterCondition } from './attribute-filter';

/**
 * Rendered inside a real query, not on its own: drizzle qualifies every column
 * when a fragment is rendered alone and emits bare names inside a query, where
 * a bare `"productId"` would bind to whichever table in scope owns one.
 */
const db = drizzle({ client: {} as never, schema });

const render = (key?: string, value?: string) =>
  db
    .select({ slug: products.slug })
    .from(products)
    .where(and(attributeFilterCondition(db, key, value)))
    .toSQL();

describe('attributeFilterCondition', () => {
  it('is absent without a key, so an unfiltered list stays unfiltered', () => {
    expect(attributeFilterCondition(db, undefined, 'Blue')).toBeUndefined();
    // A value alone is not a question: values only mean anything under a key.
    expect(render(undefined, 'Blue').sql).not.toContain('product_attributes');
  });

  it('correlates on the product row rather than joining', () => {
    const { sql: text } = render('Colour');

    expect(text).toContain(
      '"product_attributes"."productId" = "products"."id"',
    );
    expect(text).toContain('exists');
    expect(text).not.toContain('join');
  });

  it('narrows to one value when given one', () => {
    const { sql: text, params } = render('Colour', 'Blue');

    expect(text).toContain('"product_attributes"."value"');
    expect(params).toEqual(['Colour', 'Blue']);
  });

  it('binds the text as parameters rather than inlining it', () => {
    const { sql: text, params } = render("'; drop table users--");

    expect(params).toEqual(["'; drop table users--"]);
    expect(text).not.toContain('drop table');
  });
});
