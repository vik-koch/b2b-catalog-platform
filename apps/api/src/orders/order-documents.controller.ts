import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  AuthUser,
  ORDER_DOCUMENT_MAX_UPLOAD_BYTES,
  OrderDetail,
} from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrderDocumentActs, orderDocumentKind } from './order-document-acts';
import {
  OrderDocumentsService,
  ServedDocument,
} from './order-documents.service';
import { ordersExternallyOwned } from '../settings/ownership.refusals';
import { SettingsService } from '../settings/settings.service';
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
 *
 * What the acts themselves do lives in `OrderDocumentActs`, shared with the
 * machine route an owning system posts to (FR-ADM-08).
 */
@Controller('order-documents')
export class OrderDocumentsController {
  constructor(
    private readonly orders: OrdersService,
    private readonly documents: OrderDocumentsService,
    private readonly acts: OrderDocumentActs,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Supplying a file, sending it and taking it back off are acts on the order
   * like any other, so they close with the rest of them while an external
   * system owns order processing (FR-ADM-10) — which is the same moment that
   * system's own route opens. Reading stays open: the document is part of what
   * staff must be able to see.
   */
  private refuseIfOwned(action: string): void {
    if (this.settings.isExternallyOwned('orders')) {
      throw ordersExternallyOwned(action);
    }
  }

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
        orderDocumentKind(kind),
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
        orderDocumentKind(kind),
        order,
        'customer',
      ),
    );
  }

  /**
   * File a document against an order.
   *
   * `notify` is accepted but not what the admin screen uses — telling the
   * customer is its own act, below, and can be repeated. It stays on the
   * upload for the system that posts a file and a message in one exchange,
   * which has nobody to ask.
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
    const kind = orderDocumentKind(kindParam);
    this.refuseIfOwned('supply a document');
    // Read before the write, so the refusal for an unknown reference is the
    // 404 the reader expects rather than a file stored against nothing.
    await this.orders.getForStaff(reference);
    return this.acts.supply(reference, kind, file, user, notify === 'true');
  }

  /**
   * Tell the customer about a document that is already filed (FR-ORD-05).
   *
   * A button of its own rather than a tick on the upload: a manager uploads a
   * file when they have it and writes to the customer when the order is ready
   * to be written to, and those are not always the same minute. It can be
   * pressed again — a customer who lost the mail is asking for it a second
   * time, not for a new document.
   */
  @Auth('admin', 'manager')
  @Post(':reference/:kind/notify')
  async notifyAbout(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Param('kind') kindParam: string,
  ): Promise<void> {
    const kind = orderDocumentKind(kindParam);
    this.refuseIfOwned('send a document to the customer');
    const order = await this.orders.getForStaff(reference);
    await this.acts.tell(reference, kind, order, user);
  }

  /** Take a supplied file back off. */
  @Auth('admin', 'manager')
  @Delete(':reference/:kind')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Param('kind') kind: string,
  ): Promise<void> {
    this.refuseIfOwned('take a document off an order');
    await this.orders.getForStaff(reference);
    await this.acts.remove(reference, orderDocumentKind(kind), user);
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
}
