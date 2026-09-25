import { shuffled } from './featured-row';

describe('shuffled', () => {
  it('keeps every item exactly once', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect([...shuffled(items)].sort()).toEqual(items);
  });

  it('leaves the input alone', () => {
    const items = ['a', 'b', 'c'];
    shuffled(items, () => 0);
    expect(items).toEqual(['a', 'b', 'c']);
  });

  it('moves the leading items, so the featured ones have no fixed place', () => {
    // Always picking the first remaining slot rotates the head to the tail.
    expect(shuffled(['f1', 'f2', 'r1', 'r2'], () => 0)).toEqual([
      'f2',
      'r1',
      'r2',
      'f1',
    ]);
  });

  it('answers an empty row with an empty row', () => {
    expect(shuffled([])).toEqual([]);
  });
});
