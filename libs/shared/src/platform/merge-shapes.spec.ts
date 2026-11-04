import { mergeShapes } from './merge-shapes';

describe('mergeShapes', () => {
  it('joins the parts', () => {
    expect(mergeShapes({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('refuses a key two parts claim', () => {
    expect(() => mergeShapes({ a: 1 }, { a: 2 })).toThrow(
      '"a" is claimed twice',
    );
  });
});
