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
import { CurrentMachine } from '../../api-tokens/current-machine.decorator';
import { Machine } from '../../api-tokens/machine.decorator';
import { MachineClient } from '../../api-tokens/machine-client';
import { ordersNotExternallyOwned } from '../../settings/ownership.refusals';
import { OwnershipState } from '../../settings/ownership-state';
import { MachineThrottle } from '../../throttling/throttle-presets';
import {
  OrderDocumentActs,
  orderDocumentKind,
} from '../../core/ordering/order-document-acts';
import { OrderReader } from '../../core/ordering/order-reader';

/**
 * The shop's own paperwork from the system that prints it (FR-ORD-05,
 * FR-ADM-08).
 *
 * - Bytes, not markup: stored as it arrived, never redrawn from exchange data.
 * - Outside the run: no version, no `sync_runs` row (ADR 0051, ADR 0062).
 * - The `order-sync` scope: filing the invoice is the same pen as answering.
 *
 * The adapter supplies the file before the version that announces it, so one
 * mail carries both; a late invoice uses the document's own `notify`.
 */
@Machine('order-sync')
@MachineThrottle()
@Controller('machine/orders')
export class MachineOrderDocumentsController {
  constructor(
    private readonly orders: OrderReader,
    private readonly acts: OrderDocumentActs,
    private readonly ownership: OwnershipState,
  ) {}

  /**
   * The mirror of the admin panel's refusal (FR-ADM-10): only the side that
   * owns orders files documents, so no credential reaches past the switch.
   */
  private refuseUnlessOwned(): void {
    if (!this.ownership.isExternallyOwned('orders')) {
      throw ordersNotExternallyOwned();
    }
  }

  /**
   * Files a document, replacing any of that kind. `notify` is required, as on
   * the write-back: whether the customer hears is the shop's decision.
   */
  @Post(':reference/documents/:kind')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ORDER_DOCUMENT_MAX_UPLOAD_BYTES },
    }),
  )
  async supply(
    @CurrentMachine() machine: MachineClient,
    @Param('reference') reference: string,
    @Param('kind') kindParam: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('notify') notify: string | undefined,
  ) {
    const kind = orderDocumentKind(kindParam);
    this.refuseUnlessOwned();
    // Read first, so an unknown reference is a 404 rather than a file stored
    // against nothing.
    await this.orders.getForStaff(reference);
    return this.acts.supply(
      reference,
      kind,
      file,
      { token: machine.name },
      notify === 'true',
    );
  }

  /**
   * Takes one off: for a file on the wrong order or superseded. While orders
   * are owned nobody else can, the panel's delete is refused.
   */
  @Delete(':reference/documents/:kind')
  async remove(
    @CurrentMachine() machine: MachineClient,
    @Param('reference') reference: string,
    @Param('kind') kind: string,
  ): Promise<void> {
    this.refuseUnlessOwned();
    await this.orders.getForStaff(reference);
    await this.acts.remove(reference, orderDocumentKind(kind), {
      token: machine.name,
    });
  }
}
