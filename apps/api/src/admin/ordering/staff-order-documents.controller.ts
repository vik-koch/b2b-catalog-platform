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
import { ordersExternallyOwned } from '../../core/site/ownership.refusals';
import { OwnershipState } from '../../core/site/ownership-state';

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
   * Closed with every other act while an external system owns orders
   * (FR-ADM-10), the moment that system's own route opens. Reading stays open.
   */
  private refuseIfOwned(action: string): void {
    if (this.ownership.isExternallyOwned('orders')) {
      throw ordersExternallyOwned(action);
    }
  }

  /**
   * `notify` is for a system posting a file and a message in one exchange; the
   * admin screen tells the customer as its own act.
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
   * Tells the customer about a filed document (FR-ORD-05): its own button,
   * since a file and the moment to write about it rarely coincide. Repeatable:
   * a lost mail is asked for again.
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
