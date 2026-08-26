import { ShipmentLineInput, shipmentEstimate } from './shipment-estimate';

/** 100 pieces to a box (10 × 10), shipping as two cartons. */
const boxed: ShipmentLineInput = {
  packaging: { piecesPerPack: 10, packsPerBox: 10, minPieceQty: 1 },
  pieces: 100,
  boxVolume: '0.240',
  boxWeight: '12.500',
  boxCount: 2,
};

describe('shipmentEstimate', () => {
  it('multiplies the quantity, never the carton count, into the figures', () => {
    const estimate = shipmentEstimate([{ ...boxed, pieces: 300 }]);

    // Three box units of a two-carton product: six cartons, and the stated
    // volume and weight — which already cover both cartons — tripled.
    expect(estimate).toMatchObject({
      cartons: 6,
      volume: '0.720',
      weight: '37.500',
      approximate: false,
    });
  });

  it('derives a part box from the packaging ratios and rounds cartons up', () => {
    // 50 of a 100-piece box is half a box: one carton of the two, half the
    // weight.
    expect(shipmentEstimate([{ ...boxed, pieces: 50 }])).toMatchObject({
      cartons: 1,
      weight: '6.250',
      approximate: true,
    });
    // 101 pieces spills into the next carton.
    expect(shipmentEstimate([{ ...boxed, pieces: 101 }]).cartons).toBe(3);
  });

  it('adds up across lines', () => {
    const estimate = shipmentEstimate([
      boxed,
      { ...boxed, pieces: 50, boxCount: 1 },
    ]);

    // Half a box of a one-carton product: one carton on top of the two.
    expect(estimate).toMatchObject({
      cartons: 3,
      volume: '0.360',
      weight: '18.750',
      coveredLines: 2,
      uncoveredLines: 0,
    });
  });

  it('counts a line with no box rather than pretending it weighs nothing', () => {
    const unboxed: ShipmentLineInput = {
      ...boxed,
      packaging: { piecesPerPack: null, packsPerBox: null, minPieceQty: 1 },
      pieces: 4,
    };

    expect(shipmentEstimate([boxed, unboxed])).toMatchObject({
      cartons: 2,
      coveredLines: 1,
      uncoveredLines: 1,
    });
  });

  it('keeps a missing figure missing while still counting cartons', () => {
    const estimate = shipmentEstimate([
      { ...boxed, boxVolume: null, boxWeight: null },
    ]);

    expect(estimate).toMatchObject({
      cartons: 2,
      volume: null,
      weight: null,
      coveredLines: 1,
    });
  });

  it('is empty for an empty cart', () => {
    expect(shipmentEstimate([])).toEqual({
      cartons: 0,
      volume: null,
      weight: null,
      coveredLines: 0,
      uncoveredLines: 0,
      approximate: false,
    });
  });
});
