import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import {
  generatedSummaryFileName,
  OrderDetail,
  OrderDocument,
  OrderDocumentKind,
  AdminOrderDocument,
} from '@b2b-catalog-platform/shared/core/ordering';
import { DRIZZLE } from '../../platform/db/database.module';
import { orderDocuments, orderRevisions, orders } from './ordering-schema';
import { MEDIA_STORE, MediaStore } from '../../platform/media/media-store';
import { MailAttachment } from '../../platform/mail/mailer';
import { OrderPdf } from './order-pdf';
import { Database } from '../../platform/db/database';

/** A file on its way out: the bytes, and what the browser should call them. */
export interface ServedDocument {
  readonly bytes: Buffer;
  readonly fileName: string;
  readonly contentType: string;
}

/**
 * The documents an order carries (FR-ORD-05). Only supplied files are
 * rows; the summary is drawn on demand from the `OrderDetail` the caller
 * already resolved, so who may read which version is asked once.
 */
@Injectable()
export class OrderDocumentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    private readonly pdf: OrderPdf,
  ) {}

  /**
   * What the customer may open: the summary always, and a supplied file unless
   * it was filed against a version their page has not reached.
   * Payment instructions only while money is due or paid (FR-ORD-04): never
   * before acceptance, never on an unpaid order that ended.
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
        // Staff-only keys dropped by name. The customer's shape is strict, so a
        // key left on is a 500 rather than a leak.
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
   * The staff list: plus the version a file was filed against and whether the
   * order moved past it, the only warning there is.
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
    // A slip is stale only where what it states changed: every move writes a
    // version, and a warning about nothing teaches staff to ignore the next.
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
   * Whether what a payment slip states differs between two versions: the
   * amount, the party, the invoice address, the method. Not a delivery date or
   * a note.
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
    // A version gone is a question this cannot answer: warn.
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

    // One document per kind: a supplied summary replaces the generated one.
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
   * The bytes of one document for a reader already entitled to the order.
   * `order` is the version the summary is drawn from: a customer's own.
   */
  async read(
    reference: string,
    kind: OrderDocumentKind,
    order: OrderDetail,
    /**
     * Staff read whatever is filed; a customer what their own list offers, so a
     * link kept from last week cannot open what the page stopped showing.
     */
    as: 'staff' | 'customer' = 'staff',
  ): Promise<ServedDocument> {
    const { id } = await this.identify(reference);
    const row = await this.supplied(id, kind);
    // The customer's own list, already filtered, is the rule.
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
      // Payment instructions are only ever supplied: nothing to draw.
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
   * Files a document, replacing any of that kind. Writes no version: a file
   * changes nothing the order says.
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
    // The replaced file is read first and deleted after the write: the row is
    // the record, and a failed write must not lose the old file.
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
          // A replaced file has never been sent.
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
      // A replaced file has never been sent.
      notifiedAt: null,
    };
  }

  /**
   * Records that the customer was written to about this document, once the mail
   * is queued: a send that fails later is the log's business.
   */
  async markNotified(orderId: string, kind: OrderDocumentKind): Promise<void> {
    await this.db
      .update(orderDocuments)
      .set({ notifiedAt: new Date() })
      .where(
        and(eq(orderDocuments.orderId, orderId), eq(orderDocuments.kind, kind)),
      );
  }

  /**
   * Takes a supplied file off. The summary falls back to the generated one;
   * payment instructions stop existing, as on every cash order.
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
   * The row's own identity, which a customer's view of the order does not
   * carry. The caller has already established that the reader may see it.
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
   * The supplied payment instructions as an attachment, or null (FR-ORD-05):
   * the platform has nothing of its own to say about how to pay.
   */
  async paymentAttachment(orderId: string): Promise<MailAttachment | null> {
    const row = await this.supplied(orderId, 'payment-instructions');
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
