import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { orderDocumentKind } from './order-document-acts';
import {
  OrderDocumentsService,
  ServedDocument,
} from './order-documents.service';
import { OrdersService } from './orders.service';

/**
 * Reading an order's documents (FR-ORD-05, FR-CART-05, FR-ACC-02, ADR 0052).
 *
 * Not an oRPC contract, for the same reason the media upload is not: what
 * travels here is raw bytes, which the JSON contracts do not model. What each
 * order *carries* is on the order itself, in the contract, so a screen knows
 * what it may open without asking here.
 *
 * The access rule is the order's own, and it is enforced by *reading the
 * order* the way this caller is entitled to read it: staff read any order,
 * a customer only their own, and a mailed link only through its token. A
 * reader who cannot get the order cannot get the document. Staff and
 * customers share the route, which is why it sits in core; supplying and
 * removing files is staff's alone.
 */
@Controller('order-documents')
export class OrderDocumentsController {
  constructor(
    private readonly orders: OrdersService,
    private readonly documents: OrderDocumentsService,
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
