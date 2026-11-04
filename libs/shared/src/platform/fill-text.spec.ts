import * as z from 'zod';
import { fillText, refuseCountForms } from './fill-text';

describe('fillText', () => {
  it('substitutes every occurrence of a placeholder', () => {
    // The minimum is also the step, so `{qty}` appears twice in one sentence.
    expect(
      fillText('minimum {qty} {unit}, in steps of {qty}', {
        qty: 10,
        unit: 'pcs',
      }),
    ).toBe('minimum 10 pcs, in steps of 10');
  });

  it('leaves a `|` as written', () => {
    expect(fillText('Found: {count} | {total}', { count: 1, total: 2 })).toBe(
      'Found: 1 | 2',
    );
  });
});

describe('refuseCountForms', () => {
  const schema = z
    .object({
      catalog: z.object({ found: z.string(), title: z.string() }),
      lines: z.array(z.string()),
    })
    .superRefine(refuseCountForms);

  it('names every counting text written in two forms', () => {
    const result = schema.safeParse({
      catalog: {
        found: '{count} product found|{count} products found',
        title: 'Catalog',
      },
      lines: ['{count} line|{count} lines'],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['catalog', 'found'],
      ['lines', 0],
    ]);
  });

  // Only the old syntax is refused: `|` is ordinary text elsewhere.
  it('accepts a `|` in a text that counts nothing', () => {
    expect(
      schema.safeParse({
        catalog: { found: 'Products found: {count}', title: 'Shop | Catalog' },
        lines: [],
      }).success,
    ).toBe(true);
  });
});
