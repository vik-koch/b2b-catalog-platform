import {
  encodeAttributeParams,
  parseAttributeParams,
} from './attribute-filter';

describe('attribute filter parameters', () => {
  it('round-trips a selection', () => {
    const selections = [
      { slug: 'colour', values: ['Blue', 'Red'] },
      { slug: 'length', values: ['30'] },
    ];

    expect(encodeAttributeParams(selections)).toEqual([
      'colour:Blue',
      'colour:Red',
      'length:30',
    ]);
    expect(parseAttributeParams(encodeAttributeParams(selections))).toEqual(
      selections,
    );
  });

  it('keeps a value that contains the separator or a comma', () => {
    // "1,5" is a real attribute value, which is why nothing is comma-joined.
    expect(parseAttributeParams(['size:1,5', 'note:10:30'])).toEqual([
      { slug: 'size', values: ['1,5'] },
      { slug: 'note', values: ['10:30'] },
    ]);
  });

  it('accepts a single parameter as a bare string', () => {
    expect(parseAttributeParams('colour:Blue')).toEqual([
      { slug: 'colour', values: ['Blue'] },
    ]);
    expect(parseAttributeParams(undefined)).toEqual([]);
  });

  it('drops entries that select nothing, rather than refusing the listing', () => {
    expect(
      parseAttributeParams(['colour', ':Blue', 'colour:', 'colour:   ']),
    ).toEqual([]);
  });

  it('collapses a repeated value and keeps first-seen order', () => {
    expect(
      parseAttributeParams([
        'colour:Blue',
        'length:30',
        'colour:Blue',
        'colour:Red',
      ]),
    ).toEqual([
      { slug: 'colour', values: ['Blue', 'Red'] },
      { slug: 'length', values: ['30'] },
    ]);
  });

  it('trims the surrounding whitespace a URL may carry', () => {
    expect(parseAttributeParams([' colour : Blue '])).toEqual([
      { slug: 'colour', values: ['Blue'] },
    ]);
  });
});
