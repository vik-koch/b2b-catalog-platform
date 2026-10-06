import type { AddressConfig } from '@b2b-catalog-platform/shared';
import {
  addressLines,
  fillText,
  formatMoneyMinor,
  MoneyFormat,
  OrderAddress,
  OrderDetail,
  OrderReferenceConfig,
} from '@b2b-catalog-platform/shared';
import { Inject, Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import {
  ADDRESS_CONFIG,
  MONEY_FORMAT,
  ORDER_REFERENCE_CONFIG,
} from '../config/deployment-config';
import { MAIL_BRANDING, MailBranding } from '../mail/mail-branding';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { PdfFaces } from '../pdf/pdf-faces';
import { Sheet } from '../pdf/pdf-sheet';
import { shopDay } from './shop-day';

/**
 * The order summary the platform draws for itself (FR-ORD-05, FR-ACC-02,
 * ADR 0052).
 *
 * Drawn from an `OrderDetail` — the version the reader is entitled to, which
 * the caller has already resolved — so the document says exactly what the
 * screen that offered it says. Nothing is stored: the same version renders the
 * same file however long afterwards.
 *
 * The layout is deliberately plain. A shop whose back-office prints its own
 * paperwork supplies that instead, and this is what a deployment without one
 * gets.
 */
@Injectable()
export class OrderPdf {
  constructor(
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(MAIL_BRANDING) private readonly branding: MailBranding,
    @Inject(MONEY_FORMAT) private readonly currency: MoneyFormat,
    @Inject(ADDRESS_CONFIG) private readonly address: AddressConfig | undefined,
    private readonly faces: PdfFaces,
    @Inject(ORDER_REFERENCE_CONFIG)
    private readonly reference: OrderReferenceConfig,
  ) {}

  async orderSummary(order: OrderDetail): Promise<Buffer> {
    const t = this.text.orderSummaryPdf;
    const pdf = await PDFDocument.create();
    const { faces, encode } = await this.faces.embed(pdf);

    pdf.setTitle(fillText(t.title, { reference: order.reference }));
    pdf.setProducer(this.branding.name);

    const sheet = new Sheet(pdf, faces, encode);
    sheet.heading(this.branding.name, 16);
    sheet.heading(fillText(t.title, { reference: order.reference }), 13);
    sheet.gap(12);

    sheet.field(t.placedLabel, this.day(order.createdAt));
    sheet.field(t.statusLabel, t.statuses[order.status]);
    sheet.field(t.paymentLabel, this.payment(order));
    sheet.field(t.contactLabel, [
      order.contact.name,
      order.contact.email,
      order.contact.phone,
    ]);
    sheet.field(t.invoiceLabel, [
      order.party.registrationId
        ? `${order.party.name} · ${order.party.registrationId}`
        : order.party.name,
      ...this.lines(order.billingAddress),
    ]);
    sheet.field(
      order.pickup ? t.pickupLabel : t.deliveryLabel,
      order.pickup
        ? [order.pickup.name, order.pickup.address]
        : this.lines(order.deliveryAddress),
    );
    sheet.field(
      t.whenLabel,
      order.preferredDate ? this.day(order.preferredDate) : t.whenAny,
    );
    if (order.termsDate) {
      sheet.field(
        t.termsLabel,
        fillText(t.termsVersion, {
          date: shopDay(
            order.termsDate,
            this.currency.locale,
            this.reference.timezone,
          ),
        }),
      );
    }
    if (order.customerNote) sheet.field(t.noteLabel, order.customerNote);
    if (order.changes.length > 0) sheet.field(t.changesLabel, order.changes);

    sheet.gap(10);
    sheet.table(
      [t.itemsLabel, t.quantityLabel, t.lineTotalLabel],
      order.lines.map((line) => [
        line.note ? `${line.name}\n${line.note}` : line.name,
        this.quantity(line),
        formatMoneyMinor(line.lineTotalMinor, this.currency),
      ]),
    );
    sheet.total(
      t.totalLabel,
      formatMoneyMinor(order.totalMinor, this.currency),
    );
    if (t.returnNotice) {
      sheet.gap(16);
      sheet.paragraph(t.returnNotice);
    }
    sheet.footer(t.footer);

    return Buffer.from(await pdf.save());
  }

  /** How the order is paid, and whether it has been. */
  private payment(order: OrderDetail): string {
    const t = this.text.orderSummaryPdf;
    const method = {
      cash: t.payments.cash,
      'bank-transfer': t.payments.bankTransfer,
      'card-later': t.payments.cardLater,
    }[order.paymentMethod];
    const state = {
      'not-due': t.paymentStates.notDue,
      awaiting: t.paymentStates.awaiting,
      paid: t.paymentStates.paid,
    }[order.paymentState];
    return `${method} · ${state}`;
  }

  /**
   * The reading the line was bought through, and its piece count where those
   * differ — the same two figures the order mails state, and for the same
   * reason: the document is read beside goods somebody is counting.
   */
  private quantity(line: OrderDetail['lines'][number]): string {
    const units = this.text.common.units;
    return line.unit === 'piece'
      ? fillText(this.text.common.quantity, {
          qty: line.quantity,
          unit: units.piece,
        })
      : fillText(this.text.common.quantityPieces, {
          qty: line.quantity,
          unit: units[line.unit],
          pieces: line.pieces,
          pieceUnit: units.piece,
        });
  }

  /**
   * A date as this deployment writes them, in UTC: an order's preferred date
   * is a plain day, and reading it in the container's zone is how a document
   * comes out a day earlier than the page that offered it.
   */
  private day(iso: string): string {
    return new Intl.DateTimeFormat(this.currency.locale, {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(iso));
  }

  private lines(address: OrderAddress | null): string[] {
    return address ? addressLines(address, this.address) : [];
  }
}
