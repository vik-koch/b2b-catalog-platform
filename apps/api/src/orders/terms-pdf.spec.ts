import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PDFDocument } from 'pdf-lib';
import * as schema from '../db/schema';
import { demoMailBranding, demoMailText } from '../mail/mail-text.fixture';
import { PdfFaces } from '../pdf/pdf-faces';
import { demoAdminOrder } from './order.fixture';
import { TermsPdf } from './terms-pdf';

const version = {
  title: 'Terms of sale',
  bodyHtml:
    '<h2>Returns</h2><p>Within <strong>14 days</strong>.</p><ul><li>Unopened</li></ul>',
  // 23:30 UTC is the next day in Berlin, which the file name must follow.
  createdAt: new Date('2026-08-31T23:30:00.000Z'),
};

/** Answers the one select the attachment makes. */
const dbReturning = (rows: unknown[]) =>
  ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => rows }) }),
    }),
  }) as unknown as NodePgDatabase<typeof schema>;

const terms = (attached: boolean, rows: unknown[] = [version]) =>
  new TermsPdf(
    dbReturning(rows),
    attached,
    demoMailText,
    demoMailBranding,
    { code: 'EUR', locale: 'de-DE' },
    { prefix: 'CK', timezone: 'Europe/Berlin' },
    new PdfFaces(undefined),
  );

describe('TermsPdf', () => {
  it('draws the version’s text as a PDF titled by it', async () => {
    const bytes = await terms(true).render(version, 'As updated on 1 Sep');

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toBe('Terms of sale');
  });

  it('attaches the accepted version, named by its day in the shop’s zone', async () => {
    const [attachment] = await terms(true).receiptAttachments(demoAdminOrder);

    expect(attachment.fileName).toBe('terms-of-sale-2026-09-01.pdf');
    expect(attachment.contentType).toBe('application/pdf');
    expect(attachment.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('attaches nothing where the deployment does not attach the terms', async () => {
    expect(await terms(false).receiptAttachments(demoAdminOrder)).toEqual([]);
  });

  it('attaches nothing to an order that accepted no terms', async () => {
    expect(
      await terms(true).receiptAttachments({
        ...demoAdminOrder,
        termsVersion: null,
        termsDate: null,
      }),
    ).toEqual([]);
  });

  // The receipt still names the version, so a failed render costs only the
  // file, never the mail.
  it('gives up the attachment rather than the receipt when drawing fails', async () => {
    const broken = terms(true, [{ ...version, createdAt: null }]);

    expect(await broken.receiptAttachments(demoAdminOrder)).toEqual([]);
  });
});
