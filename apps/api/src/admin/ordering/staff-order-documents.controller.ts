import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ORDER_DOCUMENT_MAX_UPLOAD_BYTES } from '@b2b-catalog-platform/shared/core/ordering';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import {
  OrderDocumentActs,
  orderDocumentKind,
} from '../../core/ordering/order-document-acts';
import { OrderReader } from '../../core/ordering/order-reader';
import { ordersExternallyOwned } from '../../settings/ownership.refusals';
import { OwnershipState } from '../../settings/ownership-state';

/**
 * Staff acts on an order's documents: supply, send, take off. Reading them is
 * `OrderDocumentsController`'s, on the same path. What the acts do lives in
 * `OrderDocumentActs`, shared with the machine route an owning system posts
 * to (FR-ADM-08).
 */
@Controller('order-documents')
export class StaffOrderDocumentsController {
  constructor(
    private readonly orders: OrderReader,
    private readonly acts: OrderDocumentActs,
    private readonly ownership: OwnershipState,
  ) {}

  /**
   * Supplying a file, sending it and taking it back off are acts on the order
   * like any other, so they close with the rest of them while an external
   * system owns order processing (FR-ADM-10) — which is the same moment that
   * system's own route opens. Reading stays open: the document is part of what
   * staff must be able to see.
   */
  private refuseIfOwned(action: string): void {
    if (this.ownership.isExternallyOwned('orders')) {
      throw ordersExternallyOwned(action);
    }
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
}
