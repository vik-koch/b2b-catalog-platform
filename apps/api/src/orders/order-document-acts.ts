import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  AdminOrderDetail,
  AdminOrderDocument,
  ORDER_DOCUMENT_FILE_NAME_MAX_LENGTH,
  ORDER_DOCUMENT_KINDS,
  OrderDocumentKind,
} from '@b2b-catalog-platform/shared';
import { AuditActor, AuditLogger } from '../audit/audit.logger';
import {
  documentExtension,
  sniffAcceptedDocument,
} from '../media/document-content-type';
import { OrderDocumentsService } from './order-documents.service';
import { OrderNotifications } from './order-notifications';
import { OrdersService } from './orders.service';

/**
 * The three acts on an order's documents — file one, tell the customer about
 * it, take it back off — with the caller left out of them (FR-ORD-05).
 *
 * Its own service because there are two callers with the same acts and
 * opposite gates: a manager does these while the shop owns order processing,
 * and an owning system does them while it does not (FR-ADM-10). Only *who may*
 * differs, so only that stays in the controllers; what happens, what is
 * refused and what is logged is one copy here.
 *
 * None of it writes a version (ADR 0051): a file arriving changes nothing the
 * order says.
 */
/** The kind named in a path, or a refusal. Shared by both routes so an
 * unknown one is the same answer whoever asked. */
export function orderDocumentKind(value: string): OrderDocumentKind {
  const kind = ORDER_DOCUMENT_KINDS.find((known) => known === value);
  if (!kind) throw new BadRequestException('No such document kind');
  return kind;
}

@Injectable()
export class OrderDocumentActs {
  constructor(
    private readonly orders: OrdersService,
    private readonly documents: OrderDocumentsService,
    private readonly notifications: OrderNotifications,
    private readonly audit: AuditLogger,
  ) {}

  /**
   * File a document against an order, optionally writing to the customer in
   * the same breath.
   *
   * The bytes are sniffed rather than trusted: what a multipart part claims to
   * be is the sender's word for it, and this store is read back out to
   * browsers.
   */
  async supply(
    reference: string,
    kind: OrderDocumentKind,
    file: Express.Multer.File | undefined,
    actor: AuditActor,
    notify: boolean,
  ): Promise<AdminOrderDocument> {
    if (!file) {
      throw new BadRequestException('No file uploaded (field "file")');
    }
    const mime = await sniffAcceptedDocument(file.buffer);
    if (!mime) {
      throw new UnsupportedMediaTypeException(
        'Unsupported document type (allowed: PDF, PNG, JPEG, WebP, GIF)',
      );
    }
    const document = await this.documents.supply(
      reference,
      kind,
      {
        bytes: file.buffer,
        ext: documentExtension(mime),
        name: file.originalname.slice(0, ORDER_DOCUMENT_FILE_NAME_MAX_LENGTH),
        contentType: mime,
      },
      // An automated client has no account to attribute the row to. Who filed
      // it is in the audit line instead, as the credential's own name.
      'token' in actor ? null : actor.id,
    );
    this.audit.record('order.document.supplied', actor, {
      id: reference,
      name: kind,
    });
    // Read again before writing to the customer, not the order the caller had
    // in hand: `tell` decides from the order's own document list, and the
    // document it is about is the one this call has just put there.
    if (notify) {
      await this.tell(
        reference,
        kind,
        await this.orders.getForStaff(reference),
        actor,
      );
    }
    return document;
  }

  /**
   * Tell the customer about a document that is already filed.
   *
   * Refused while the customer's own page is behind the version the file was
   * filed against: the message would announce a document they cannot open, and
   * the way out of that is to bring them up to date first — which is why an
   * owning system supplies the file *before* the version that announces it.
   */
  async tell(
    reference: string,
    kind: OrderDocumentKind,
    order: AdminOrderDetail,
    actor: AuditActor,
  ): Promise<void> {
    const document = order.documents.find((entry) => entry.kind === kind);
    if (!document || document.source !== 'supplied') {
      throw new ConflictException({
        code: 'document-not-supplied',
        message: 'There is no supplied document of that kind to send',
      });
    }
    if ((document.suppliedForRevision ?? 0) > order.customerRevisionNumber) {
      throw new ConflictException({
        code: 'customer-behind',
        message: 'The customer has not been shown the version this belongs to',
      });
    }

    const { id, publicToken } = await this.documents.identify(reference);
    // The instructions travel with the message; a summary is linked, so the
    // reader always opens the version they are entitled to.
    const attachment =
      kind === 'payment-instructions'
        ? await this.documents.paymentAttachment(reference)
        : null;
    await this.notifications.documentSupplied(
      order,
      kind,
      publicToken,
      attachment ? [attachment] : [],
    );
    await this.documents.markNotified(id, kind);
    this.audit.record('order.document.sent', actor, {
      id: reference,
      name: kind,
    });
  }

  /** Take a supplied file back off. The summary falls back to the generated
   * one; payment instructions stop existing. */
  async remove(
    reference: string,
    kind: OrderDocumentKind,
    actor: AuditActor,
  ): Promise<void> {
    await this.documents.remove(reference, kind);
    this.audit.record('order.document.removed', actor, {
      id: reference,
      name: kind,
    });
  }
}
