import {
  AdminOrderDetail,
  fillText,
  MoneyFormat,
  OrderReferenceConfig,
} from '@b2b-catalog-platform/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PDFDocument } from 'pdf-lib';
import {
  MONEY_FORMAT,
  ORDER_REFERENCE_CONFIG,
  TERMS_ATTACHED,
} from '../config/deployment-config';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { pageVersions } from '../db/schema';
import { MAIL_BRANDING, MailBranding } from '../mail/mail-branding';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailAttachment } from '../mail/mailer';
import { PdfFaces } from '../pdf/pdf-faces';
import { Sheet } from '../pdf/pdf-sheet';
import { richTextBlocks } from '../pdf/rich-text-blocks';
import { shopDay, shopIsoDay } from './shop-day';

const HEADING_SIZES = { 2: 13, 3: 11.5, 4: 10.5 } as const;

/**
 * The terms an order accepted, as a document the customer keeps
 * (NFR-LEGAL-10): the page version's own text, set like the order summary.
 */
@Injectable()
export class TermsPdf {
  private readonly logger = new Logger(TermsPdf.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(TERMS_ATTACHED) private readonly attached: boolean,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(MAIL_BRANDING) private readonly branding: MailBranding,
    @Inject(MONEY_FORMAT) private readonly currency: MoneyFormat,
    @Inject(ORDER_REFERENCE_CONFIG)
    private readonly reference: OrderReferenceConfig,
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
      const t = this.text.orderReceived;
      const iso = version.createdAt.toISOString();
      const zone = this.reference.timezone;
      return [
        {
          fileName: fillText(t.termsFileName, { date: shopIsoDay(iso, zone) }),
          contentType: 'application/pdf',
          bytes: await this.render(
            version,
            fillText(t.termsVersion, {
              date: shopDay(iso, this.currency.locale, zone),
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
