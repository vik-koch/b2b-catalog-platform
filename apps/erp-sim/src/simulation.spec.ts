import { load } from './simulation';

// The one deployment with a simulated back office, read the way the simulator
// reads it on its stack. The suite runs from the workspace root.
const slaney = 'deployments/slaney-labware-ie';

describe('load', () => {
  it('reads the Slaney Labware simulation, its tracked products and its time zone', () => {
    const { simulation, tracked, timeZone } = load(
      `${slaney}/seed`,
      `${slaney}/config`,
    );
    expect(timeZone).toBe('Europe/Dublin');
    expect(simulation.catalog.deliveryNights).toBeGreaterThan(0);
    expect(tracked.length).toBeGreaterThan(0);
    // The bundle's out-of-stock case is among them, at zero.
    expect(tracked.some(({ stockPieces }) => stockPieces === 0)).toBe(true);
  });
});

describe('the new-product pool', () => {
  it('schedules one article every few nights, in the category the bundle names', () => {
    const { simulation, newProducts } = load(
      `${slaney}/seed`,
      `${slaney}/config`,
    );
    const every = simulation.catalog.newProducts.everyNights;
    expect(newProducts.map((p) => p.night)).toEqual(
      newProducts.map((_, index) => (index + 1) * every),
    );
    // The category's own name, from the bundle — a different one would rename
    // the category on the shop's side.
    expect(newProducts[0]).toMatchObject({
      sourceId: 'BEA-600',
      categorySourceId: 'beakers',
      categoryName: 'Beakers',
    });
  });
});
