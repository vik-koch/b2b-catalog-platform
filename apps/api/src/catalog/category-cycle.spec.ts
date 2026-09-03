import { hasCycle } from './category-cycle';

const tree = (entries: [string, string | null][]) => new Map(entries);

describe('hasCycle', () => {
  it('accepts a forest of roots', () => {
    expect(
      hasCycle(
        tree([
          ['a', null],
          ['b', null],
        ]),
      ),
    ).toBe(false);
  });

  it('accepts a chain', () => {
    expect(
      hasCycle(
        tree([
          ['a', null],
          ['b', 'a'],
          ['c', 'b'],
          ['d', 'b'],
        ]),
      ),
    ).toBe(false);
  });

  it('rejects a node parented to itself', () => {
    expect(hasCycle(tree([['a', 'a']]))).toBe(true);
  });

  it('rejects a two-node loop', () => {
    expect(
      hasCycle(
        tree([
          ['a', 'b'],
          ['b', 'a'],
        ]),
      ),
    ).toBe(true);
  });

  it('rejects a loop that no root leads into', () => {
    expect(
      hasCycle(
        tree([
          ['root', null],
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'a'],
        ]),
      ),
    ).toBe(true);
  });

  it('treats an unknown parent as a root rather than looping', () => {
    expect(hasCycle(tree([['a', 'missing']]))).toBe(false);
  });
});
