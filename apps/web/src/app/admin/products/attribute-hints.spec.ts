import {
  AttributeDefinition,
  AttributeKeyUsage,
} from '@b2b-catalog-platform/shared';
import {
  attributeHints,
  attributeRowStatus,
  AttributeHint,
} from './attribute-hints';

const usage = (
  key: string,
  productCount: number,
  definition: AttributeKeyUsage['definition'] = null,
): AttributeKeyUsage => ({ key, productCount, valueCount: 1, definition });

const definition = (
  name: string,
  type: 'text' | 'number' = 'text',
  unit: string | null = null,
): AttributeDefinition => ({
  id: `def-${name}`,
  name,
  slug: name.toLowerCase(),
  type,
  unit,
  sortOrder: 0,
  productCount: 0,
  valueCount: 0,
  unparsedCount: 0,
  updatedAt: '2026-08-19T10:00:00.000Z',
});

const byKey = (hints: AttributeHint[]) =>
  new Map(hints.map((hint) => [hint.key, hint]));

describe('attributeHints', () => {
  it('merges the two lists and keeps them alphabetical', () => {
    const hints = attributeHints(
      [usage('Roast', 4), usage('Colour', 2)],
      [definition('Length', 'number', 'cm')],
    );
    expect(hints.map((hint) => hint.key)).toEqual([
      'Colour',
      'Length',
      'Roast',
    ]);
  });

  it('keeps the usage count of a key that is also declared', () => {
    const [hint] = attributeHints(
      [usage('Length', 7)],
      [definition('Length', 'number', 'cm')],
    );
    expect(hint).toEqual({
      key: 'Length',
      productCount: 7,
      type: 'number',
      unit: 'cm',
    });
  });

  it('discounts the edited product from the counts', () => {
    const [hint] = attributeHints([usage('Roast', 3)], [], ['Roast']);
    expect(hint.productCount).toBe(2);

    const [alone] = attributeHints([usage('Lenght', 1)], [], ['Lenght']);
    expect(alone.productCount).toBe(0);
  });

  it('offers a definition no product carries yet', () => {
    const [hint] = attributeHints([], [definition('Colour')]);
    expect(hint.productCount).toBe(0);
    expect(hint.type).toBe('text');
  });
});

describe('attributeRowStatus', () => {
  const hints = byKey(
    attributeHints(
      [usage('Roast', 4)],
      [definition('Length', 'number', 'cm'), definition('Colour')],
    ),
  );

  it('says nothing about an empty row or a plain freetext key', () => {
    expect(attributeRowStatus({ key: '', value: '' }, hints)).toBe('none');
    expect(attributeRowStatus({ key: ' Roast ', value: 'Dark' }, hints)).toBe(
      'none',
    );
  });

  it('flags a key nothing else in the catalog carries', () => {
    expect(attributeRowStatus({ key: 'Lenght', value: '30' }, hints)).toBe(
      'unknown',
    );
    // Carried by this product alone — saving the typo does not make it known.
    const discounted = byKey(
      attributeHints([usage('Lenght', 1)], [], ['Lenght']),
    );
    expect(attributeRowStatus({ key: 'Lenght', value: '30' }, discounted)).toBe(
      'unknown',
    );
  });

  it('still declares a filterable key the rest of the catalog ignores', () => {
    // A definition is somebody else knowing the name, whoever carries it.
    const declared = byKey(
      attributeHints([usage('Colour', 1)], [definition('Colour')], ['Colour']),
    );
    expect(attributeRowStatus({ key: 'Colour', value: 'Blue' }, declared)).toBe(
      'filterable',
    );
  });

  it('marks a declared key filterable', () => {
    expect(attributeRowStatus({ key: 'Colour', value: 'Blue' }, hints)).toBe(
      'filterable',
    );
    expect(attributeRowStatus({ key: 'Length', value: '30' }, hints)).toBe(
      'filterable',
    );
  });

  it('warns only where an unreadable number costs the filter', () => {
    expect(attributeRowStatus({ key: 'Length', value: '30 cm' }, hints)).toBe(
      'not-numeric',
    );
    // Nothing to warn about until a value is typed.
    expect(attributeRowStatus({ key: 'Length', value: '' }, hints)).toBe(
      'filterable',
    );
    // The same value under a text attribute is simply a value.
    expect(attributeRowStatus({ key: 'Colour', value: '30 cm' }, hints)).toBe(
      'filterable',
    );
  });
});
