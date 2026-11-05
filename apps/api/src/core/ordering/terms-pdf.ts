import { sharedOrderingText, orderingPdf } from './ordering-text';
import { SharedText, fillText } from '@b2b-catalog-platform/shared/platform';
import { AdminOrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { SHOP_TIME_ZONE } from '../../platform/config/deployment-config';
import { TERMS_ATTACHED } from './terms-config';
import { DRIZZLE } from '../../platform/db/database.module';
import { pageVersions } from '../site/site-schema';
import { MAIL_BRANDING, MailBranding } from '../../platform/mail/mail-branding';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { PDF_TEXT, PdfText } from '../../platform/pdf/pdf-text';
import { MailAttachment } from '../../platform/mail/mailer';
import { PdfFaces } from '../../platform/pdf/pdf-faces';
import { Sheet } from '../../platform/pdf/pdf-sheet';
import { richTextBlocks } from '../../platform/pdf/rich-text-blocks';
import { shopDay, shopIsoDay } from '@b2b-catalog-platform/shared/platform';
import { Database } from '../../platform/db/database';

const HEADING_SIZES = { 2: 13, 3: 11.5, 4: 10.5 } as const;

/**
 * The terms an order accepted, as a document the customer keeps
 * (NFR-LEGAL-10): the page version's own text, set like the order summary.
 */
@Injectable()
export class TermsPdf {
  private readonly logger = new Logger(TermsPdf.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(TERMS_ATTACHED) private readonly attached: boolean,
    @Inject(PDF_TEXT) private readonly text: PdfText,
    @Inject(SHARED_TEXT) private readonly common: SharedText,
    @Inject(MAIL_BRANDING) private readonly branding: MailBranding,
    @Inject(SHOP_TIME_ZONE) private readonly timeZone: string,
    private readonly faces: PdfFaces,
  ) {}

  /**
   * The receipt's attachment, where the deployment attaches the terms. Its own
   * failure costs only the attachment: the receipt still names the version.
   */
  async receiptAttachments(order: AdminOrderDetail): Promise<MailAttachment[]> {
    if (!this.attached || order.termsVersion === null) return [];
    try {
      const [version] = await this.db
        .select()
        .from(pageVersions)
        .where(
          and(
            eq(pageVersions.slug, 'terms'),
            eq(pageVersions.version, order.termsVersion),
          ),
        )
        .limit(1);
      if (!version) return [];
      const iso = version.createdAt.toISOString();
      const zone = this.timeZone;
      return [
        {
          fileName: fillText(orderingPdf(this.text).terms.fileName, {
            date: shopIsoDay(iso, zone),
          }),
          contentType: 'application/pdf',
          bytes: await this.render(
            version,
            fillText(sharedOrderingText(this.common).order.termsVersion, {
              date: shopDay(iso, this.branding.locale, zone),
            }),
          ),
        },
      ];
    } catch (error) {
      this.logger.error(
        `Could not attach the terms to the receipt for ${order.reference}`,
        error,
      );
      return [];
    }
  }

  async render(
    terms: { title: string; bodyHtml: string },
    /** Which version this is, as the receipt names it. */
    updated: string,
  ): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const { faces, encode } = await this.faces.embed(pdf);
    pdf.setTitle(terms.title);
    pdf.setProducer(this.branding.name);
    pdf.setLanguage(this.branding.locale);

    const sheet = new Sheet(pdf, faces, encode);
    sheet.heading(this.branding.name, 16);
    sheet.heading(terms.title, 13);
    sheet.runs([{ text: updated }], { muted: true });
    sheet.gap(10);

    for (const block of richTextBlocks(terms.bodyHtml)) {
      if (block.kind === 'heading') {
        sheet.gap(6);
        sheet.runs(
          block.runs.map((run) =>
            'text' in run ? { ...run, bold: true } : run,
          ),
          { size: HEADING_SIZES[block.level] },
        );
      } else if (block.kind === 'rule') {
        sheet.gap(4);
        sheet.rule();
      } else {
        sheet.runs(block.runs, { indent: block.indent, marker: block.marker });
        sheet.gap(4);
      }
    }
    return Buffer.from(await pdf.save());
  }
}
