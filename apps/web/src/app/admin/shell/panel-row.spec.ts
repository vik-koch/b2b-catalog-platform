import { panelRowFloor } from './panel-row';

/**
 * The panel's rhythm, which is the whole reason a row measures itself: a card
 * is a stack of 48px rows, and a row that grew to whatever it happened to
 * contain is what put a card 14px out of line with the one beside it.
 */
describe('panelRowFloor', () => {
  it('keeps a row that fits on one row', () => {
    expect(panelRowFloor(0)).toBe(48);
    expect(panelRowFloor(48)).toBe(48);
  });

  it('treats a sub-pixel overflow as a fit', () => {
    // Text metrics are fractional; a row is not two rows high because a
    // line box measured 48.3px.
    expect(panelRowFloor(48.4)).toBe(48);
  });

  it('takes a whole second row, hairline included, once it does not fit', () => {
    expect(panelRowFloor(49)).toBe(97);
    expect(panelRowFloor(97)).toBe(97);
  });

  it('goes on in whole rows', () => {
    expect(panelRowFloor(98)).toBe(146);
    expect(panelRowFloor(146)).toBe(146);
    expect(panelRowFloor(147)).toBe(195);
  });
});
