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
import { OrderReader } from './order-reader';

/**
 * Reading an order's documents (FR-ORD-05, FR-ACC-02): raw bytes, so
 * not an oRPC contract. Access is the order's own, enforced by reading the
 * order as this caller may: staff any, a customer their own, a link by its
 * token. Shared by staff and customers, hence core.
 */
@Controller('order-documents')
export class OrderDocumentsController {
  constructor(
    private readonly orders: OrderReader,
    private readonly documents: OrderDocumentsService,
  ) {}

  /**
   * Staff get the current version's summary, a customer the one their page
   * shows.
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

  /** The mailed link's way in (FR-NOTIF-06): the version its page shows. */
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

  /** Inline: a customer opening their summary wants to read it. */
  private serve(response: Response, document: ServedDocument): void {
    response
      .status(200)
      .setHeader('Content-Type', document.contentType)
      .setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      )
      // A document about one person is never cached by anybody else.
      .setHeader('Cache-Control', 'private, no-store')
      .send(document.bytes);
  }
}
