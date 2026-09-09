import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { AddressConfig } from '@b2b-catalog-platform/shared';
import { demoMailBranding, demoMailText } from '../mail/mail-text.fixture';
import { demoAdminOrder } from './order.fixture';
import { OrderPdf, winAnsi } from './order-pdf';

/**
 * A real TrueType face to prove the embedding path with. Nothing is shipped in
 * the image — a deployment supplies its own (ADR 0052) — so this borrows the
 * system's, and the case is skipped where the machine has none rather than
 * making a font package a condition of running the suite.
 */
const FONT_DIR = '/usr/share/fonts/truetype/dejavu';
const hasSystemFont = existsSync(join(FONT_DIR, 'DejaVuSans.ttf'));

/**
 * A deployment that names its own face gets it embedded; one that names none
 * prints in Helvetica. Both paths are exercised below — the second is what
 * the demo and every deployment writing in a Latin script actually gets.
 */
const font = undefined;

const address = {
  countries: [{ code: 'DE', label: 'Germany' }],
} as unknown as AddressConfig;

const render = (order = demoAdminOrder) =>
  new OrderPdf(
    demoMailText,
    demoMailBranding,
    { code: 'EUR', locale: 'de-DE' },
    address,
    font,
  ).orderSummary(order);

describe('OrderPdf', () => {
  it('draws a PDF carrying the order', async () => {
    const bytes = await render();

    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    // The reference is the document's title, which is what names the file in a
    // reader's tab and in a downloads folder.
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toContain(demoAdminOrder.reference);
    expect(loaded.getPageCount()).toBe(1);
  });

  /**
   * Umlauts and accents on the standard face: a deployment writing in a Latin
   * script needs no font file, which is the whole reason nothing is shipped.
   */
  it('writes accented Latin without a font file', async () => {
    const bytes = await render({
      ...demoAdminOrder,
      customerNote: 'Bitte an Frau Müller — pré-emballé, 5 × 20.',
    });

    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  /**
   * A standard face refuses to draw a character it cannot encode, and one
   * product name in another script must not cost the customer their whole
   * document. The deployment that needs those names sets `branding.font.pdf`.
   */
  it('replaces what the standard face cannot write, rather than failing', async () => {
    expect(winAnsi('Café Ω кофе')).toBe('Café ? ????');

    const bytes = await render({
      ...demoAdminOrder,
      customerNote: 'кофе, 20 кг',
    });
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  /**
   * The named face is embedded rather than referenced: a document read on a
   * machine that has never heard of that typeface has to render, and a PDF
   * that only names its font is one that comes out in something else.
   */
  it.skipIf(!hasSystemFont)('embeds a named face as a subset', async () => {
    const named = new OrderPdf(
      demoMailText,
      demoMailBranding,
      { code: 'EUR', locale: 'de-DE' },
      address,
      {
        regular: join(FONT_DIR, 'DejaVuSans.ttf'),
        bold: join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
      },
    );

    // Re-saved without object streams so the dictionaries are readable: what
    // pdf-lib writes is Flate-compressed, and the question here is which keys
    // are in the file rather than how they are packed.
    const loaded = await PDFDocument.load(
      await named.orderSummary(demoAdminOrder),
    );
    const readable = Buffer.from(
      await loaded.save({ useObjectStreams: false }),
    ).toString('latin1');

    expect(readable).toContain('FontFile2');
    expect(readable).toContain('DejaVu');
  });

  /**
   * An order long enough to run past one page still renders — the layout has
   * no page-break logic beyond "start a new one", and a table that drew off
   * the bottom would lose lines silently.
   */
  it('runs onto a second page for a long order', async () => {
    const line = demoAdminOrder.lines[0];
    const long = {
      ...demoAdminOrder,
      lines: Array.from({ length: 60 }, (_, index) => ({
        ...line,
        name: `${line.name} ${index}`,
      })),
    };

    const loaded = await PDFDocument.load(await render(long));
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });
});
