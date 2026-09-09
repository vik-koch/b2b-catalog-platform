import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  AdminOrderDetail,
  AuthUser,
  ORDER_DOCUMENT_FILE_NAME_MAX_LENGTH,
  ORDER_DOCUMENT_KINDS,
  ORDER_DOCUMENT_MAX_UPLOAD_BYTES,
  OrderDetail,
  OrderDocumentKind,
} from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import {
  documentExtension,
  sniffAcceptedDocument,
} from '../media/document-content-type';
import {
  OrderDocumentsService,
  ServedDocument,
} from './order-documents.service';
import { OrderNotifications } from './order-notifications';
import { OrdersService } from './orders.service';

/**
 * An order's documents (FR-ORD-05, FR-CART-05, FR-ACC-02, ADR 0052).
 *
 * Not an oRPC contract, for the same reason the media upload is not: what
 * travels here is raw bytes in both directions, which the JSON contracts do
 * not model. What each order *carries* is on the order itself, in the
 * contract, so a screen knows what it may open without asking here.
 *
 * The access rule is the order's own, and it is enforced by *reading the
 * order* the way this caller is entitled to read it: staff read any order,
 * a customer only their own, and a mailed link only through its token. A
 * reader who cannot get the order cannot get the document, and there is no
 * second copy of the rule to fall out of step with the first.
 */
@Controller('order-documents')
export class OrderDocumentsController {
  constructor(
    private readonly orders: OrdersService,
    private readonly documents: OrderDocumentsService,
    private readonly notifications: OrderNotifications,
    private readonly audit: AuditLogger,
  ) {}

  /**
   * Staff and the customer who placed it. Which version the summary is drawn
   * from follows from which read succeeded: staff get the current one, a
   * customer the one their own page shows.
   */
  @Auth()
  @Get(':reference/:kind')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Param('kind') kind: string,
    @Res() response: Response,
  ): Promise<void> {
    const staff = user.role === 'admin' || user.role === 'manager';
    const order: OrderDetail = staff
      ? await this.orders.getForStaff(reference)
      : await this.orders.getForUser(user.id, reference);
    this.serve(
      response,
      await this.documents.read(
        reference,
        this.kind(kind),
        order,
        staff ? 'staff' : 'customer',
      ),
    );
  }

  /** The mailed link's way in (FR-NOTIF-06): the token is the credential, and
   * it resolves the same order and the same entitled version the page it came
   * with shows. */
  @Get('by-token/:token/:kind')
  async getByToken(
    @Param('token') token: string,
    @Param('kind') kind: string,
    @Res() response: Response,
  ): Promise<void> {
    const order = await this.orders.getByToken(token);
    this.serve(
      response,
      await this.documents.read(
        order.reference,
        this.kind(kind),
        order,
        'customer',
      ),
    );
  }

  /**
   * File a document against an order. Writes no version (ADR 0051): nothing
   * about the order changed.
   *
   * `notify` is accepted but not what the admin screen uses — telling the
   * customer is its own act, below, and can be repeated. It stays on the
   * upload for the system that will one day post a file and a message in one
   * exchange, which has nobody to ask.
   */
  @Auth('admin', 'manager')
  @Post(':reference/:kind')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ORDER_DOCUMENT_MAX_UPLOAD_BYTES },
    }),
  )
  async supply(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Param('kind') kindParam: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('notify') notify: string | undefined,
  ) {
    const kind = this.kind(kindParam);
    if (!file) {
      throw new BadRequestException('No file uploaded (field "file")');
    }
    const mime = await sniffAcceptedDocument(file.buffer);
    if (!mime) {
      throw new UnsupportedMediaTypeException(
        'Unsupported document type (allowed: PDF, PNG, JPEG, WebP, GIF)',
      );
    }
    // Read before the write, so the refusal for an unknown reference is the
    // 404 the reader expects rather than a file stored against nothing.
    const order = await this.orders.getForStaff(reference);
    const document = await this.documents.supply(
      reference,
      kind,
      {
        bytes: file.buffer,
        ext: documentExtension(mime),
        name: file.originalname.slice(0, ORDER_DOCUMENT_FILE_NAME_MAX_LENGTH),
        contentType: mime,
      },
      user.id,
    );
    this.audit.record('order.document.supplied', user, {
      id: reference,
      name: kind,
    });
    if (notify === 'true') await this.tell(reference, kind, order, user);
    return document;
  }

  /**
   * Tell the customer about a document that is already filed (FR-ORD-05).
   *
   * A button of its own rather than a tick on the upload: a manager uploads a
   * file when they have it and writes to the customer when the order is ready
   * to be written to, and those are not always the same minute. It can be
   * pressed again — a customer who lost the mail is asking for it a second
   * time, not for a new document.
   *
   * Refused while the customer's own page is behind the version the file was
   * filed against: the message would announce a document they cannot open,
   * and the way to fix that is to bring them up to date first.
   */
  @Auth('admin', 'manager')
  @Post(':reference/:kind/notify')
  async notifyAbout(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Param('kind') kindParam: string,
  ): Promise<void> {
    const kind = this.kind(kindParam);
    const order = await this.orders.getForStaff(reference);
    await this.tell(reference, kind, order, user);
  }

  /** The message itself, shared by the button and the upload's own flag. */
  private async tell(
    reference: string,
    kind: OrderDocumentKind,
    order: AdminOrderDetail,
    user: AuthUser,
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

    const { publicToken } = await this.documents.identify(reference);
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
    const { id } = await this.documents.identify(reference);
    await this.documents.markNotified(id, kind);
    this.audit.record('order.document.sent', user, {
      id: reference,
      name: kind,
    });
  }

  /** Take a supplied file back off. The summary falls back to the generated
   * one; payment instructions stop existing. */
  @Auth('admin', 'manager')
  @Delete(':reference/:kind')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Param('kind') kind: string,
  ): Promise<void> {
    await this.orders.getForStaff(reference);
    await this.documents.remove(reference, this.kind(kind));
    this.audit.record('order.document.removed', user, {
      id: reference,
      name: kind,
    });
  }

  /**
   * Inline rather than as a download: a customer opening their order summary
   * wants to look at it, and a browser that saved it instead would have them
   * hunting in a folder for a file they meant to read.
   */
  private serve(response: Response, document: ServedDocument): void {
    response
      .status(200)
      .setHeader('Content-Type', document.contentType)
      .setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      )
      // Nothing caches a document about one person: it is regenerated on
      // demand and cheap, and a shared cache holding it is exactly what
      // keeping it off the public prefix was for.
      .setHeader('Cache-Control', 'private, no-store')
      .send(document.bytes);
  }

  private kind(value: string): OrderDocumentKind {
    const kind = ORDER_DOCUMENT_KINDS.find((known) => known === value);
    if (!kind) throw new BadRequestException('No such document kind');
    return kind;
  }
}
