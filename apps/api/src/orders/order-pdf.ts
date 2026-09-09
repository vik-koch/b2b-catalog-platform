import type { AddressConfig } from '@b2b-catalog-platform/shared';
import {
  addressLines,
  fillText,
  formatMoneyMinor,
  MoneyFormat,
  OrderAddress,
  OrderDetail,
} from '@b2b-catalog-platform/shared';
import { Inject, Injectable } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  RGB,
  StandardFonts,
} from 'pdf-lib';
import {
  ADDRESS_CONFIG,
  MONEY_FORMAT,
  PDF_FONT,
  PdfFontFiles,
} from '../config/deployment-config';
import { MAIL_BRANDING, MailBranding } from '../mail/mail-branding';
import { MAIL_TEXT, MailText } from '../mail/mail-text';

/** A4, in PDF points. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;
/** Space between two fields of the top block. Wide enough that a two-line
 * address and the field under it are plainly two answers. */
const FIELD_GAP = 6;

/** The two faces the layout uses, embedded once per document. */
interface Faces {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
}

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
  /** Read once per process: the file is immutable for the container's life. */
  private faces: Promise<{ regular: Buffer; bold: Buffer }> | undefined;

  constructor(
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(MAIL_BRANDING) private readonly branding: MailBranding,
    @Inject(MONEY_FORMAT) private readonly currency: MoneyFormat,
    @Inject(ADDRESS_CONFIG) private readonly address: AddressConfig | undefined,
    @Inject(PDF_FONT) private readonly font: PdfFontFiles | undefined,
  ) {}

  async orderSummary(order: OrderDetail): Promise<Buffer> {
    const t = this.text.orderSummaryPdf;
    const pdf = await PDFDocument.create();
    const faces = await this.embed(pdf);

    pdf.setTitle(fillText(t.title, { reference: order.reference }));
    pdf.setProducer(this.branding.name);

    const sheet = new Sheet(pdf, faces, this.font ? null : winAnsi);
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

  /**
   * The two faces this document is set in.
   *
   * A deployment that names its own gets it embedded and subset — TrueType or
   * OpenType, never the `woff2` the browser is served (ADR 0052). One that
   * names none gets Helvetica, which every reader already has: it needs no
   * file, no licence and no megabyte in the image, and it covers the Latin
   * alphabets with their accents and umlauts. It cannot write anything else,
   * which is what `branding.font.pdf` is for — see config/README.md.
   */
  private async embed(pdf: PDFDocument): Promise<Faces> {
    const files = this.font;
    if (!files) {
      return {
        regular: await pdf.embedFont(StandardFonts.Helvetica),
        bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      };
    }
    pdf.registerFontkit(fontkit);
    const bytes = await this.fontFiles(files);
    return {
      // Subset, so a document embeds the glyphs it uses rather than a face
      // covering half of Unicode: the file is mailed and kept.
      regular: await pdf.embedFont(bytes.regular, { subset: true }),
      bold: await pdf.embedFont(bytes.bold, { subset: true }),
    };
  }

  /** Read once per process: the files are immutable for the container's
   * life. */
  private fontFiles(
    files: PdfFontFiles,
  ): Promise<{ regular: Buffer; bold: Buffer }> {
    return (this.faces ??= Promise.all([
      readFile(files.regular),
      readFile(files.bold),
    ]).then(([regular, bold]) => ({ regular, bold })));
  }
}

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.85, 0.85, 0.85);

/**
 * A page being written down, top to bottom.
 *
 * Deliberately small: pdf-lib draws text at a coordinate and nothing else, so
 * what a layout needs is a cursor, wrapping, and a rule for when to start a new
 * page. Anything richer would be a layout engine, which is what ADR 0052 chose
 * a library over a browser to avoid.
 */
class Sheet {
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;
  private readonly width = PAGE_WIDTH - MARGIN * 2;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly faces: Faces,
    /** Applied to every string before it is drawn, where the face cannot
     * write everything: a standard face throws on a character it has no
     * encoding for, and one product name must not cost the whole document. */
    private readonly encode: ((text: string) => string) | null,
  ) {
    this.page = this.newPage();
  }

  /** One place where text meets the page, so the encoding guard cannot be
   * forgotten at a call site. */
  private write(
    text: string,
    options: Parameters<PDFPage['drawText']>[1],
  ): void {
    this.page.drawText(this.plain(text), options);
  }

  /** Measured on the same string that will be drawn — a character replaced
   * after it was measured puts every column out. */
  private widthOf(text: string, font: PDFFont, size: number): number {
    return font.widthOfTextAtSize(this.plain(text), size);
  }

  /** Every string entering the page passes through here first, so wrapping
   * measures exactly what will be drawn. */
  private plain(text: string): string {
    return this.encode ? this.encode(text) : text;
  }

  heading(text: string, size: number): void {
    this.draw(text, { size, font: this.faces.bold, height: size + 6 });
  }

  gap(points: number): void {
    this.y -= points;
  }

  /** A label and its value, as one row: the label on the left in muted small
   * caps-height text, the value wrapped in the column beside it. */
  field(label: string, value: string | string[]): void {
    const values = (Array.isArray(value) ? value : [value])
      .filter(Boolean)
      .map((entry) => this.plain(entry));
    if (values.length === 0) return;
    const labelWidth = 130;
    const wrapped = values.flatMap((entry) =>
      entry
        .split('\n')
        .flatMap((line) =>
          wrap(line, this.faces.regular, BODY_SIZE, this.width - labelWidth),
        ),
    );
    this.ensure(wrapped.length * LINE_HEIGHT + FIELD_GAP);
    const top = this.y;
    this.write(label, {
      x: MARGIN,
      y: top,
      size: BODY_SIZE,
      font: this.faces.regular,
      color: MUTED,
    });
    wrapped.forEach((line, index) => {
      this.write(line, {
        x: MARGIN + labelWidth,
        y: top - index * LINE_HEIGHT,
        size: BODY_SIZE,
        font: this.faces.regular,
        color: INK,
      });
    });
    // A gap between fields, not only between the lines inside one: the block
    // is a list of answers to different questions, and set solid it reads as
    // one paragraph of them.
    this.y = top - wrapped.length * LINE_HEIGHT - FIELD_GAP;
  }

  /**
   * The lines. Three columns — what it was, how much of it, what it came to —
   * with the two numeric ones right-aligned, because a column of figures is
   * read by comparing them.
   */
  table(headings: string[], rows: string[][]): void {
    // caller's array is a literal built for this call.
    const columns = [this.width - 200, 110, 90];
    const x = [MARGIN, MARGIN + columns[0], MARGIN + columns[0] + columns[1]];
    this.ensure(LINE_HEIGHT * 2);
    headings = headings.map((heading) => this.plain(heading));
    headings.forEach((heading, index) => {
      const width = this.widthOf(heading, this.faces.bold, BODY_SIZE);
      this.write(heading, {
        // The first column reads left to right; the other two end where the
        // figures under them end.
        x: index === 0 ? x[index] : x[index] + columns[index] - width,
        y: this.y,
        size: BODY_SIZE,
        font: this.faces.bold,
        color: INK,
      });
    });
    // Clear of the headings' descenders before the rule is drawn: a line at
    // the baseline strikes the words through.
    this.y -= 14;
    this.rule();

    for (const row of rows.map((row) => row.map((cell) => this.plain(cell)))) {
      const cells = row[0]
        .split('\n')
        .flatMap((line) =>
          wrap(line, this.faces.regular, BODY_SIZE, columns[0] - 12),
        );
      this.ensure(cells.length * LINE_HEIGHT + 6);
      const top = this.y;
      cells.forEach((line, index) => {
        this.write(line, {
          x: x[0],
          y: top - index * LINE_HEIGHT,
          size: BODY_SIZE,
          font: this.faces.regular,
          color: index === 0 ? INK : MUTED,
        });
      });
      row.slice(1).forEach((cell, index) => {
        const column = index + 1;
        const width = this.widthOf(cell, this.faces.regular, BODY_SIZE);
        this.write(cell, {
          x: x[column] + columns[column] - width,
          y: top,
          size: BODY_SIZE,
          font: this.faces.regular,
          color: INK,
        });
      });
      this.y = top - cells.length * LINE_HEIGHT - 4;
      this.rule();
    }
  }

  total(label: string, value: string): void {
    this.ensure(LINE_HEIGHT * 2);
    this.y -= 4;
    const width = this.widthOf(value, this.faces.bold, BODY_SIZE + 1);
    this.write(label, {
      x: MARGIN,
      y: this.y,
      size: BODY_SIZE + 1,
      font: this.faces.bold,
      color: INK,
    });
    this.write(value, {
      x: PAGE_WIDTH - MARGIN - width,
      y: this.y,
      size: BODY_SIZE + 1,
      font: this.faces.bold,
      color: INK,
    });
    this.y -= LINE_HEIGHT;
  }

  /** Written on every page as it is finished, so a page that was started by an
   * overflowing table carries it too. */
  footer(text: string): void {
    for (const page of this.pdf.getPages()) {
      page.drawText(this.plain(text), {
        x: MARGIN,
        y: MARGIN - 20,
        size: 8,
        font: this.faces.regular,
        color: MUTED,
      });
    }
  }

  private rule(): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 8 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y + 8 },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 8;
  }

  private draw(
    text: string,
    options: { size: number; font: PDFFont; height: number; color?: RGB },
  ): void {
    this.ensure(options.height);
    this.write(text, {
      x: MARGIN,
      y: this.y,
      size: options.size,
      font: options.font,
      color: options.color ?? INK,
    });
    this.y -= options.height;
  }

  /** Starts a page where what is about to be drawn will not fit on this one. */
  private ensure(height: number): void {
    if (this.y - height < MARGIN) {
      this.page = this.newPage();
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  private newPage(): PDFPage {
    return this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }
}

/**
 * What a standard face can write: the Latin alphabets, their accents and
 * umlauts, and the punctuation and currency marks around them (WinAnsi).
 *
 * Anything else becomes a question mark rather than an exception — pdf-lib
 * refuses to draw a character it cannot encode, and one product name in
 * another script would otherwise cost the customer their whole document. A
 * deployment writing in another script names its own face
 * (`branding.font.pdf`); this is the honest failure for one that has not.
 */
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function winAnsi(text: string): string {
  return [...text]
    .map((character) =>
      character.charCodeAt(0) < 0x100 || WIN_ANSI_EXTRAS.includes(character)
        ? character
        : '?',
    )
    .join('');
}

/**
 * Greedy word wrap against the embedded face's own metrics. A word longer than
 * the column — a URL, a part number — is left to overhang rather than broken:
 * a document is a thing somebody reads back to somebody else, and a hyphen
 * this inserted would be read out as part of the code.
 */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}
