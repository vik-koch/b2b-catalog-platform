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

  // The scale exists because a float round-trip turns 1.250 into 1.25 and
  // three decimals into fifteen. These hold the arithmetic to the thousandths
  // the columns are stored in.
  describe('the decimals it carries', () => {
    it('keeps trailing zeroes rather than normalising them away', () => {
      // 12.500, not 12.5: the figure is read off a shipping note.
      expect(shipmentEstimate([boxed]).weight).toBe('12.500');
      expect(shipmentEstimate([boxed]).volume).toBe('0.240');
    });

    it('does not accumulate float error across many lines', () => {
      const ten = Array.from({ length: 10 }, () => ({
        ...boxed,
        boxWeight: '0.100',
      }));

      // 0.1 × 10 in floats is 0.9999999999999999.
      expect(shipmentEstimate(ten).weight).toBe('1.000');
    });

    it('rounds a fraction to the scale rather than trailing off', () => {
      // A third of a box: 12.500 / 3 does not land on a thousandth.
      const third = shipmentEstimate([
        { ...boxed, pieces: 33, boxWeight: '12.500' },
      ]);

      expect(third.weight).toMatch(/^\d+\.\d{3}$/);
    });

    it('treats an unparseable decimal as missing, not as zero', () => {
      // A missing weight is not a weightless product, and neither is a broken
      // one — saying nothing is the honest answer.
      const estimate = shipmentEstimate([
        { ...boxed, boxWeight: 'not a number' },
      ]);

      expect(estimate.weight).toBeNull();
      expect(estimate.cartons).toBe(2);
    });
  });

  describe('what makes a summary approximate', () => {
    it('is exact where every line fills whole boxes', () => {
      expect(
        shipmentEstimate([boxed, { ...boxed, pieces: 200 }]),
      ).toMatchObject({ approximate: false });
    });

    it('is approximate as soon as one line does not', () => {
      // One exact line and one part box: the summary as a whole is an estimate.
      expect(
        shipmentEstimate([boxed, { ...boxed, pieces: 150 }]).approximate,
      ).toBe(true);
    });

    // A line with no box to derive from is uncovered rather than approximate:
    // nothing was estimated about it, it is simply absent from the figures.
    it('is not made approximate by a line it does not cover at all', () => {
      const unboxed: ShipmentLineInput = {
        ...boxed,
        packaging: { piecesPerPack: null, packsPerBox: null, minPieceQty: 1 },
        pieces: 4,
      };

      expect(shipmentEstimate([boxed, unboxed])).toMatchObject({
        approximate: false,
        uncoveredLines: 1,
      });
    });
  });

  it('counts one carton for any part of a box, however small', () => {
    // A single piece of a hundred still travels in a carton.
    expect(shipmentEstimate([{ ...boxed, pieces: 1 }]).cartons).toBe(1);
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
