import { describe, expect, it } from 'vitest';
import {
  NARROW_BODY_IN_GRID,
  NARROW_BODY_IN_LINE,
  NARROW_PADDING_IN_GRID,
  NARROW_PADDING_IN_LINE,
  NARROW_PHOTO_IN_GRID,
  NARROW_PHOTO_IN_LINE,
} from './listing-narrow';

/** Below the narrow threshold a card and a line are one drawing, differing
 * only in the container each asks; a drift shows only on a phone. */
describe('the narrow shape', () => {
  const asLine = (classes: string) => classes.split('/listing:').join('/line:');

  it('draws the photo the same way in a grid and in a line', () => {
    expect(asLine(NARROW_PHOTO_IN_GRID)).toBe(NARROW_PHOTO_IN_LINE);
  });

  it('draws the body the same way in a grid and in a line', () => {
    expect(asLine(NARROW_BODY_IN_GRID)).toBe(NARROW_BODY_IN_LINE);
  });

  it('gives a grid item and a line the same room', () => {
    expect(asLine(NARROW_PADDING_IN_GRID)).toBe(NARROW_PADDING_IN_LINE);
  });
});
