import { defaultAdminOrderingText } from './ordering-text.fixture';
import { moneyFormat } from '@b2b-catalog-platform/shared/platform';
import {
  AdminOrderDetail,
  OrderAdjustmentPreview,
} from '@b2b-catalog-platform/shared/core/ordering';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import {
  draftLines,
  draftPrice,
  offList,
  paymentOptions,
  priceNotices,
} from './order-adjust-draft';

const currency = moneyFormat(defaultDeploymentConfig);
const payments = defaultAdminOrderingText.orders.paymentMethods;
const notices = defaultAdminOrderingText.orders.adjust.priceNotice;

/** Only what the draft functions read. */
const order = {
  lines: [
    {
      slug: 'cup',
      name: 'Cup',
      pieces: 12,
      unit: 'box',
      note: 'blue',
      priceMinor: 250,
    },
    {
      slug: 'lid',
      name: 'Lid',
      pieces: 12,
      unit: null,
      note: null,
      priceMinor: 40,
    },
  ],
} as unknown as AdminOrderDetail;

function preview(
  lines: { slug: string; priceMinor: number; listPriceMinor: number | null }[],
): OrderAdjustmentPreview {
  return { lines } as unknown as OrderAdjustmentPreview;
}

describe('draftLines', () => {
  it('starts every line on the price it was ordered at', () => {
    const lines = draftLines(order, currency);
    expect(lines.map((line) => line.key)).toEqual(['0-cup', '1-lid']);
    expect(lines.every((line) => !line.fromList)).toBe(true);
    expect(draftPrice(lines[0], currency)).toBe(250);
  });
});

describe('draftPrice', () => {
  it('asks the list where the field is empty or waiting for it', () => {
    const [line] = draftLines(order, currency);
    expect(draftPrice({ ...line, priceText: ' ' }, currency)).toBe(null);
    expect(draftPrice({ ...line, fromList: true }, currency)).toBe(null);
  });
});

describe('paymentOptions', () => {
  it('invoices a company and nothing else', () => {
    expect(paymentOptions('company', payments).map((o) => o.value)).toEqual([
      'bank-transfer',
    ]);
    expect(paymentOptions('person', payments).map((o) => o.value)).toEqual([
      'cash',
      'bank-transfer',
      'card-later',
    ]);
  });
});

describe('offList', () => {
  it('is off only where the list prices the line differently', () => {
    expect(offList({ priceMinor: 100, listPriceMinor: 90 })).toBe(true);
    expect(offList({ priceMinor: 100, listPriceMinor: 100 })).toBe(false);
    expect(offList({ priceMinor: 100, listPriceMinor: null })).toBe(false);
  });
});

describe('priceNotices', () => {
  it('says nothing where every price stands and is on the list', () => {
    const same = preview([
      { slug: 'cup', priceMinor: 250, listPriceMinor: 250 },
      { slug: 'lid', priceMinor: 40, listPriceMinor: null },
    ]);
    expect(priceNotices(order, same, notices, 'Retail')).toEqual([]);
  });

  it('counts moved prices, and prices off the list, apart', () => {
    const moved = preview([
      { slug: 'cup', priceMinor: 200, listPriceMinor: 250 },
      { slug: 'lid', priceMinor: 40, listPriceMinor: 40 },
      { slug: 'new', priceMinor: 10, listPriceMinor: 10 },
    ]);
    const said = priceNotices(order, moved, notices, 'Retail');
    expect(said).toHaveLength(2);
    expect(said[1]).toContain('Retail');
  });
});
