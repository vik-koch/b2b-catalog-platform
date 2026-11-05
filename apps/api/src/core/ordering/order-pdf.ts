import { sharedOrderingText, orderingPdf } from './ordering-text';
import {
  SharedText,
  fillText,
  formatMoneyMinor,
  MoneyFormat,
} from '@b2b-catalog-platform/shared/platform';
import {
  orderLineTax,
  orderLinesDifferInTax,
  orderTaxStatement,
} from './mail/order-items';
import {
  OrderAddress,
  OrderDetail,
} from '@b2b-catalog-platform/shared/core/ordering';
import { Inject, Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import {
  MONEY_FORMAT,
  SHOP_TIME_ZONE,
} from '../../platform/config/deployment-config';
import { ADDRESS_CONFIG } from '../accounts/accounts-config';
import { MAIL_BRANDING, MailBranding } from '../../platform/mail/mail-branding';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { PdfFaces } from '../../platform/pdf/pdf-faces';
import { PDF_TEXT, PdfText } from '../../platform/pdf/pdf-text';
import { Sheet } from '../../platform/pdf/pdf-sheet';
import { shopDay } from '@b2b-catalog-platform/shared/platform';
import {
  addressLines,
  type AddressConfig,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  CATALOG_AREA,
  type SharedCatalogText,
} from '@b2b-catalog-platform/shared/core/catalog';
import { sharedTextBlock } from '../../platform/config/shared-text';

/**
 * The order summary the platform draws (FR-ORD-05, FR-ACC-02, ADR 0052), from
 * the version the caller resolved, so it says what the page that offered it
 * says. Plain on purpose: a back office with its own paperwork supplies that.
 */
@Injectable()
export class OrderPdf {
  constructor(
    @Inject(PDF_TEXT) private readonly text: PdfText,
    @Inject(SHARED_TEXT) private readonly common: SharedText,
    @Inject(MAIL_BRANDING) private readonly branding: MailBranding,
    @Inject(MONEY_FORMAT) private readonly currency: MoneyFormat,
    @Inject(ADDRESS_CONFIG) private readonly address: AddressConfig | undefined,
    private readonly faces: PdfFaces,
    @Inject(SHOP_TIME_ZONE) private readonly timeZone: string,
  ) {}

  async orderSummary(order: OrderDetail): Promise<Buffer> {
    const t = orderingPdf(this.text).orderSummary;
    const names = sharedOrderingText(this.common).order;
    const pdf = await PDFDocument.create();
    const { faces, encode } = await this.faces.embed(pdf);

    pdf.setTitle(fillText(t.title, { reference: order.reference }));
    pdf.setProducer(this.branding.name);
    pdf.setLanguage(this.branding.locale);

    const sheet = new Sheet(pdf, faces, encode);
    sheet.heading(this.branding.name, 16);
    sheet.heading(fillText(t.title, { reference: order.reference }), 13);
    sheet.gap(12);

    sheet.field(t.placedLabel, this.day(order.createdAt));
    sheet.field(names.status, this.status(order));
    sheet.field(names.payment, this.payment(order));
    sheet.field(names.contact, [
      order.contact.name,
      order.contact.email,
      order.contact.phone,
    ]);
    sheet.field(names.invoicedTo, [
      order.party.registrationId
        ? `${order.party.name} · ${order.party.registrationId}`
        : order.party.name,
      ...this.lines(order.billingAddress),
    ]);
    sheet.field(
      order.pickup ? names.pickupPoint : names.deliveryAddress,
      order.pickup
        ? [order.pickup.name, order.pickup.address]
        : this.lines(order.deliveryAddress),
    );
    sheet.field(
      order.pickup ? names.preferredPickup : names.preferredDelivery,
      order.preferredDate ? this.day(order.preferredDate) : t.whenAny,
    );
    if (order.termsDate) {
      sheet.field(
        this.common.nav.terms,
        fillText(names.termsVersion, {
          date: shopDay(order.termsDate, this.branding.locale, this.timeZone),
        }),
      );
    }
    if (order.customerNote) {
      sheet.field(names.note, order.customerNote);
    }
    if (order.changes.length > 0) sheet.field(names.changeNote, order.changes);

    sheet.gap(10);
    // A line names its rate only where the lines differ; the total names it
    // otherwise.
    const perLineTax = orderLinesDifferInTax(order);
    sheet.table(
      [t.itemsLabel, t.quantityLabel, t.lineTotalLabel],
      order.lines.map((line) => {
        const rate = perLineTax
          ? orderLineTax(line, this.branding.locale, this.common)
          : null;
        return [
          [line.name, rate, line.note].filter(Boolean).join('\n'),
          this.quantity(line),
          formatMoneyMinor(line.lineTotalMinor, this.currency),
        ];
      }),
    );
    sheet.total(
      names.total,
      formatMoneyMinor(order.totalMinor, this.currency),
      orderTaxStatement(order, this.branding.locale, this.common),
    );
    if (t.returnNotice) {
      sheet.gap(16);
      sheet.paragraph(t.returnNotice);
    }
    sheet.footer(t.footer);

    return Buffer.from(await pdf.save());
  }

  /** Where the order stands, in the customer's words: `ready` reads by how
   * the goods reach them. */
  private status(order: OrderDetail): string {
    const statuses = sharedOrderingText(this.common).order.statuses;
    if (order.status !== 'ready') return statuses[order.status];
    return order.pickup ? statuses.readyPickup : statuses.readyDelivery;
  }

  /** How the order is paid, and whether it has been. */
  private payment(order: OrderDetail): string {
    const names = sharedOrderingText(this.common).order;
    const methods = names.paymentMethods;
    const states = names.paymentStates;
    const method = {
      cash: methods.cash,
      'bank-transfer': methods.transfer,
      'card-later': methods.card,
    }[order.paymentMethod];
    const state = {
      'not-due': states.notDue,
      awaiting: states.awaiting,
      paid: states.paid,
    }[order.paymentState];
    return `${method} · ${state}`;
  }

  /** The unit read and the piece count, as the mails state them. */
  private quantity(line: OrderDetail['lines'][number]): string {
    const { units } = sharedTextBlock<SharedCatalogText>(
      this.common,
      CATALOG_AREA,
    );
    return line.unit === 'piece'
      ? fillText(this.common.quantity, {
          qty: line.quantity,
          unit: units.piece,
        })
      : fillText(this.common.quantityPieces, {
          qty: line.quantity,
          unit: units[line.unit],
          pieces: line.pieces,
          pieceUnit: units.piece,
        });
  }

  /**
   * In UTC: a preferred date is a plain day, and the server's zone would shift
   * it.
   */
  private day(iso: string): string {
    return new Intl.DateTimeFormat(this.branding.locale, {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(iso));
  }

  private lines(address: OrderAddress | null): string[] {
    return address ? addressLines(address, this.address) : [];
  }
}
