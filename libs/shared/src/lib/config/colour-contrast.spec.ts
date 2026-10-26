import { contrastRatio } from './colour-contrast';

describe('contrastRatio', () => {
  it('spans 1 to 21 between white and black, in either order', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fafaf9', '#fafaf9')).toBe(1);
  });

  it('matches the ratio a browser measures for a known pair', () => {
    // Tailwind's red-700 on its stone-100.
    expect(contrastRatio('#c10007', '#f5f5f4')).toBeCloseTo(5.89, 2);
  });
});
