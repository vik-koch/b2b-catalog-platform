import { alternateLayoutQuery } from './keyboard-layout';

describe('alternateLayoutQuery', () => {
  it('is off without a layout', () => {
    expect(alternateLayoutQuery('yya', null)).toBeNull();
    expect(alternateLayoutQuery('yya', undefined)).toBeNull();
  });

  it('swaps keys between two layouts of one alphabet', () => {
    expect(alternateLayoutQuery('yya', 'de')).toBe('zza');
    expect(alternateLayoutQuery('Fortezza', 'de')).toBe('Forteyya');
  });

  it('reads the letters a layout keeps on punctuation keys', () => {
    expect(alternateLayoutQuery('M[ller', 'de')).toBe('Müller');
  });

  it('leaves a query alone where no key it used differs', () => {
    expect(alternateLayoutQuery('müller', 'de')).toBeNull();
    expect(alternateLayoutQuery('1200', 'gr')).toBeNull();
  });

  it('reads QWERTY keys as the other alphabet, and back', () => {
    expect(alternateLayoutQuery('kafes', 'gr')).toBe('καφεσ');
    expect(alternateLayoutQuery('καφεσ', 'gr')).toBe('kafes');
  });

  it('picks the direction word by word, for a layout switched mid-query', () => {
    expect(alternateLayoutQuery('kafes  καφεσ', 'gr')).toBe('καφεσ  kafes');
  });

  it('keeps the case the keys were pressed in', () => {
    expect(alternateLayoutQuery('KAFES', 'gr')).toBe('ΚΑΦΕΣ');
  });
});
