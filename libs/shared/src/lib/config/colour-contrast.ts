/** A colour written as `#rrggbb`, the one form the contrast check reads. */
export const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** WCAG's minimum for body text. */
export const TEXT_CONTRAST = 4.5;

/** WCAG's minimum for a mark that identifies something without words. */
export const MARK_CONTRAST = 3;

/** The contrast ratio between two `#rrggbb` colours, as WCAG 2 defines it. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
