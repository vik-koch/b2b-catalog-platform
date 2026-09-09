import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  AdminOrderDocument,
  generatedSummaryFileName,
  OrderDetail,
  OrderDocument,
  OrderDocumentKind,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { orderDocuments, orderRevisions, orders } from '../db/schema';
import { MEDIA_STORE, MediaStore } from '../media/media-store';
import { MailAttachment } from '../mail/mailer';
import { OrderPdf } from './order-pdf';

/** A file on its way out: the bytes, and what the browser should call them. */
export interface ServedDocument {
  readonly bytes: Buffer;
  readonly fileName: string;
  readonly contentType: string;
}

/**
 * The documents an order carries (FR-ORD-05, ADR 0052).
 *
 * Only supplied files are rows. The summary is drawn on demand from the order
 * as the reader is entitled to read it, so this service is asked for bytes
 * with an `OrderDetail` in hand rather than with an id — who may read which
 * version is the caller's question, and answering it twice is how the two
 * answers come apart.
 */
@Injectable()
export class OrderDocumentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    private readonly pdf: OrderPdf,
  ) {}

  /**
   * What can be opened on this order, as the customer sees it: the summary,
   * always, and a payment instruction where the shop has supplied one and the
   * order is still invoiced.
   *
   * Two things are withheld, and both are about not showing somebody a
   * document that answers a question they have not been asked yet:
   *
   * - **A version they have not been shown.** A file filed against a version
   *   the customer's own page has not reached would be the first they hear of
   *   it (ADR 0051) — the same rule their page follows.
   * - **Payment instructions on an order that owes nothing.** The slip is how
   *   to pay what is due, so it appears when the money becomes due and stays
   *   while it is owed or has been paid — a paid invoice is a receipt somebody
   *   keeps. It is withheld before the shop has accepted the order, and after
   *   an unpaid one ends: an order nobody is filling is not one to transfer
   *   money for. That is the payment state's own answer (FR-ORD-04), not a
   *   second rule about methods — a cash order never becomes due, so it never
   *   shows one.
   */
  async listForCustomer(
    orderId: string,
    reference: string,
    seen: { revisionNumber: number; paymentState: string },
  ): Promise<OrderDocument[]> {
    const documents = await this.list(orderId, reference, seen.revisionNumber);
    return (
      documents
        .filter((document) => this.customerMaySee(document, seen))
        // Everything staff-only dropped by name: which version it was filed
        // against, whether the order has moved past it, and whether the shop has
        // written about it. The customer's shape is strict, so a key left on is
        // a 500 rather than a leak.
        .map(({ suppliedForRevision, outdated, notifiedAt, ...rest }) => rest)
    );
  }

  private customerMaySee(
    document: AdminOrderDocument,
    seen: { revisionNumber: number; paymentState: string },
  ): boolean {
    if (document.source === 'generated') return true;
    if ((document.suppliedForRevision ?? 0) > seen.revisionNumber) return false;
    return (
      document.kind !== 'payment-instructions' ||
      seen.paymentState !== 'not-due'
    );
  }

  /**
   * The staff list. The same documents, plus which version a supplied file was
   * filed against and whether the order has moved past what it says — nothing
   * checks a supplied file against the order, so this is the only warning
   * there is.
   */
  async listForStaff(
    orderId: string,
    reference: string,
    revisionNumber: number,
  ): Promise<AdminOrderDocument[]> {
    const documents = await this.list(orderId, reference, revisionNumber);
    const payment = documents.find(
      (document) => document.kind === 'payment-instructions',
    );
    // A payment slip is only stale where what it *states* has changed. Every
    // move writes a version (ADR 0051), so an order confirmed and then made
    // ready is two versions past the slip and says exactly the same money to
    // exactly the same party — a warning there is one nobody would act on, and
    // one that teaches staff to ignore the next.
    if (payment?.outdated && payment.suppliedForRevision) {
      const changed = await this.invoiceChanged(
        orderId,
        payment.suppliedForRevision,
        revisionNumber,
      );
      if (!changed) payment.outdated = false;
    }
    return documents;
  }

  /**
   * Whether anything a payment slip states differs between two versions: what
   * is owed, who owes it, where the invoice goes, and how it is to be paid.
   *
   * Not the whole snapshot. A changed delivery date or a line note is a real
   * change to the order and no reason at all to reprint an invoice.
   */
  private async invoiceChanged(
    orderId: string,
    from: number,
    to: number,
  ): Promise<boolean> {
    const material = {
      revisionNumber: orderRevisions.revisionNumber,
      totalMinor: orderRevisions.totalMinor,
      paymentMethod: orderRevisions.paymentMethod,
      partyName: orderRevisions.partyName,
      partyRegistrationId: orderRevisions.partyRegistrationId,
      billingStreet: orderRevisions.billingStreet,
      billingStreet2: orderRevisions.billingStreet2,
      billingPostalCode: orderRevisions.billingPostalCode,
      billingCity: orderRevisions.billingCity,
      billingRegion: orderRevisions.billingRegion,
      billingCountry: orderRevisions.billingCountry,
    };
    const rows = await this.db
      .select(material)
      .from(orderRevisions)
      .where(
        and(
          eq(orderRevisions.orderId, orderId),
          inArray(orderRevisions.revisionNumber, [from, to]),
        ),
      );
    const before = rows.find((row) => row.revisionNumber === from);
    const after = rows.find((row) => row.revisionNumber === to);
    // A version that is not there any more is a question this cannot answer,
    // and the safe answer is the warning.
    if (!before || !after) return true;
    const { revisionNumber: _before, ...was } = before;
    const { revisionNumber: _after, ...is } = after;
    return JSON.stringify(was) !== JSON.stringify(is);
  }

  private async list(
    orderId: string,
    reference: string,
    revisionNumber: number,
  ): Promise<AdminOrderDocument[]> {
    const rows = await this.db
      .select()
      .from(orderDocuments)
      .where(eq(orderDocuments.orderId, orderId));

    const supplied = rows.map((row): AdminOrderDocument => ({
      kind: row.kind as OrderDocumentKind,
      source: 'supplied',
      fileName: row.fileName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      suppliedAt: row.suppliedAt.toISOString(),
      suppliedForRevision: row.suppliedForRevision,
      outdated: row.suppliedForRevision < revisionNumber,
      notifiedAt: row.notifiedAt?.toISOString() ?? null,
    }));

    // The generated summary exists unless a file has taken its place: one
    // document per kind, and a reader offered two would have to guess which
    // one the shop means.
    if (!supplied.some((document) => document.kind === 'order-summary')) {
      supplied.push({
        kind: 'order-summary',
        source: 'generated',
        fileName: generatedSummaryFileName(reference),
        contentType: 'application/pdf',
        byteSize: null,
        suppliedAt: null,
        suppliedForRevision: null,
        outdated: false,
        notifiedAt: null,
      });
    }
    return supplied;
  }

  /**
   * The bytes of one document, for a reader who has already been established
   * as entitled to this order and this version of it.
   *
   * `order` is what the summary is drawn from — the version the caller
   * resolved, which for a customer is the one their own page shows.
   */
  async read(
    reference: string,
    kind: OrderDocumentKind,
    order: OrderDetail,
    /** Staff read whatever is filed. A customer reads what their own list
     * offers — the same rule, asked in both places, so a link kept from last
     * week does not open a document the page has stopped showing. */
    as: 'staff' | 'customer' = 'staff',
  ): Promise<ServedDocument> {
    const { id } = await this.identify(reference);
    const row = await this.supplied(id, kind);
    // The customer's own list is the rule, already applied: what they may
    // fetch is exactly what their page offers, so a link kept from last week
    // cannot open a document the page has stopped showing.
    const visible =
      as === 'staff' ||
      order.documents.some((document) => document.kind === kind);
    if (row && visible) {
      return {
        bytes: await this.store.readPrivate(row.fileKey),
        fileName: row.fileName,
        contentType: row.contentType,
      };
    }
    if (kind !== 'order-summary') {
      // Payment instructions are only ever supplied: there is nothing to draw
      // and nothing the platform could honestly say.
      throw new NotFoundException({
        code: 'document-not-found',
        message: 'No such document on this order',
      });
    }
    return {
      bytes: await this.pdf.orderSummary(order),
      fileName: generatedSummaryFileName(order.reference),
      contentType: 'application/pdf',
    };
  }

  /**
   * File a document against an order, replacing whatever was there of that
   * kind. Writes no revision (ADR 0051): a file arriving changes nothing the
   * order says.
   */
  async supply(
    reference: string,
    kind: OrderDocumentKind,
    file: { bytes: Buffer; ext: string; name: string; contentType: string },
    byUserId: string | null,
  ): Promise<AdminOrderDocument> {
    const order = await this.identify(reference);
    const stored = await this.store.putPrivate({
      bytes: file.bytes,
      ext: file.ext,
    });
    // Read the file it replaces before the write, so the bytes it leaves
    // behind can be collected afterwards: the row is the record, and a delete
    // that ran first would lose the old file if the write then failed.
    const previous = await this.supplied(order.id, kind);
    await this.db
      .insert(orderDocuments)
      .values({
        orderId: order.id,
        kind,
        fileKey: stored.key,
        fileName: file.name,
        contentType: file.contentType,
        byteSize: file.bytes.length,
        suppliedBy: byUserId,
        suppliedForRevision: order.revisionNumber,
      })
      .onConflictDoUpdate({
        target: [orderDocuments.orderId, orderDocuments.kind],
        set: {
          fileKey: stored.key,
          fileName: file.name,
          contentType: file.contentType,
          byteSize: file.bytes.length,
          suppliedAt: new Date(),
          suppliedBy: byUserId,
          suppliedForRevision: order.revisionNumber,
          // A replaced file has never been sent, whatever was said about the
          // one it replaces.
          notifiedAt: null,
        },
      });
    if (previous) await this.store.deletePrivate(previous.fileKey);

    return {
      kind,
      source: 'supplied',
      fileName: file.name,
      contentType: file.contentType,
      byteSize: file.bytes.length,
      suppliedAt: new Date().toISOString(),
      suppliedForRevision: order.revisionNumber,
      outdated: false,
      // A replaced file is a different document: whatever was said about the
      // last one was said about something else.
      notifiedAt: null,
    };
  }

  /** Record that the customer was written to about this document. Stamped
   * before the send, like a revision's: the mail cannot fail the record of
   * what the shop decided to tell them. */
  async markNotified(orderId: string, kind: OrderDocumentKind): Promise<void> {
    await this.db
      .update(orderDocuments)
      .set({ notifiedAt: new Date() })
      .where(
        and(eq(orderDocuments.orderId, orderId), eq(orderDocuments.kind, kind)),
      );
  }

  /**
   * Take a supplied file back off an order. The summary falls back to the
   * generated one; payment instructions simply stop existing, which is the
   * state every cash order is in.
   */
  async remove(reference: string, kind: OrderDocumentKind): Promise<void> {
    const { id } = await this.identify(reference);
    const row = await this.supplied(id, kind);
    if (!row) {
      throw new ConflictException({
        code: 'document-not-supplied',
        message: 'Nothing was supplied for this document',
      });
    }
    await this.db.delete(orderDocuments).where(eq(orderDocuments.id, row.id));
    await this.store.deletePrivate(row.fileKey);
  }

  /**
   * The order behind a reference, the version it stands on, and the token a
   * mailed link carries. Read here
   * rather than handed over: the caller has already established that this
   * reader may see this order — by having read it — and what this needs is the
   * row's own identity, which a customer's view of an order does not carry.
   */
  async identify(
    reference: string,
  ): Promise<{ id: string; revisionNumber: number; publicToken: string }> {
    const [row] = await this.db
      .select({
        id: orders.id,
        revisionNumber: orderRevisions.revisionNumber,
        publicToken: orders.publicToken,
      })
      .from(orders)
      .innerJoin(
        orderRevisions,
        eq(orderRevisions.id, orders.currentRevisionId),
      )
      .where(eq(orders.reference, reference))
      .limit(1);
    if (!row) {
      throw new NotFoundException({
        code: 'order-not-found',
        message: 'No such order',
      });
    }
    return row;
  }

  /**
   * The shop's payment instructions as a file to send, or nothing where the
   * order has none (FR-ORD-05).
   *
   * Only ever the supplied file: the platform has nothing to say about how to
   * pay, and nothing to attach where the shop has not said it.
   */
  async paymentAttachment(reference: string): Promise<MailAttachment | null> {
    const { id } = await this.identify(reference);
    const row = await this.supplied(id, 'payment-instructions');
    if (!row) return null;
    return {
      fileName: row.fileName,
      contentType: row.contentType,
      bytes: await this.store.readPrivate(row.fileKey),
    };
  }

  private async supplied(orderId: string, kind: OrderDocumentKind) {
    const [row] = await this.db
      .select()
      .from(orderDocuments)
      .where(
        and(eq(orderDocuments.orderId, orderId), eq(orderDocuments.kind, kind)),
      )
      .limit(1);
    return row;
  }
}
