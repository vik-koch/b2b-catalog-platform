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
} from '@b2b-catalog-platform/shared/core/ordering';

import { AuditActor, AuditLogger } from '../../platform/audit/audit.logger';
import {
  documentExtension,
  sniffAcceptedDocument,
} from '../../platform/media/document-content-type';
import { OrderDocumentsService } from './order-documents.service';
import { OrderNotifications } from './order-notifications';
import { OrderReader } from './order-reader';

/** The kind named in a path, or a refusal. Shared by both routes so an
 * unknown one is the same answer whoever asked. */
export function orderDocumentKind(value: string): OrderDocumentKind {
  const kind = ORDER_DOCUMENT_KINDS.find((known) => known === value);
  if (!kind) throw new BadRequestException('No such document kind');
  return kind;
}

/**
 * Filing a document, telling the customer and taking it off (FR-ORD-05), for
 * the two callers with opposite gates: a manager while the shop owns orders,
 * an owning system while it does not (FR-ADM-10). None writes a version.
 */
@Injectable()
export class OrderDocumentActs {
  constructor(
    private readonly orders: OrderReader,
    private readonly documents: OrderDocumentsService,
    private readonly notifications: OrderNotifications,
    private readonly audit: AuditLogger,
  ) {}

  /**
   * Files a document, telling the customer in the same breath where asked. The
   * bytes are sniffed: a multipart part's type is the sender's word for it.
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
      // An automated client has no account; the audit line names its
      // credential.
      'token' in actor ? null : actor.id,
    );
    this.audit.record('order.document.supplied', actor, {
      id: reference,
      name: kind,
    });
    // Read again: `tell` decides from the order's own document list, which this
    // call just changed.
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
   * Tells the customer about a filed document. Refused while their page is
   * behind the version it was filed against: they could not open it. An owning
   * system therefore supplies the file before the version that announces it.
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
    // The instructions travel with the message; a summary is linked, so it
    // opens the version the reader is entitled to.
    const attachment =
      kind === 'payment-instructions'
        ? await this.documents.paymentAttachment(id)
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
