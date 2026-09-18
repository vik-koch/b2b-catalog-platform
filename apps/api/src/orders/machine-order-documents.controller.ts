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
import { ORDER_DOCUMENT_MAX_UPLOAD_BYTES } from '@b2b-catalog-platform/shared';
import { CurrentMachine } from '../api-tokens/current-machine.decorator';
import { Machine } from '../api-tokens/machine.decorator';
import { MachineClient } from '../api-tokens/machine-client';
import { ordersNotExternallyOwned } from '../settings/ownership.refusals';
import { SettingsService } from '../settings/settings.service';
import { MachineThrottle } from '../throttling/throttle-presets';
import { OrderDocumentActs, orderDocumentKind } from './order-document-acts';
import { OrdersService } from './orders.service';

/**
 * The shop's own paperwork, arriving from the system that produces it
 * (FR-ORD-05, FR-ADM-08).
 *
 * **Bytes, not markup.** What the source system prints — the payment invoice,
 * the delivery note — is a real document with the shop's own layout on it, and
 * the exchange format has no slot to carry it. So it is posted here as a file
 * and stored as it arrived: a PDF the platform drew from exchange data would
 * be a second lookalike of the shop's paperwork, drifting away from the first.
 * The platform draws only what it has the data for, which is the order summary
 * it already draws.
 *
 * **Outside the run.** A document writes no version (ADR 0051) and files no
 * `sync_runs` row: nothing about the order changed, so "one exchange writes at
 * most one version" (ADR 0062) survives untouched, and the write-back next
 * door stays a pure statement about the order.
 *
 * **`order-sync`, not a capability of its own.** Filing the shop's invoice
 * against an order is the same pen as answering it — a credential trusted to
 * say an order is confirmed is trusted to say what its invoice looks like, and
 * a second scope would be one more box to tick for no decision anybody makes
 * separately.
 *
 * The ordering rule the adapter follows: **supply the file before the version
 * that announces it**, so one message carries both. Where the back office
 * cannot produce the invoice until after it has accepted the order, the
 * document's own `notify` sends it as a second message — the acceptance mail
 * is never held for a file that may never arrive.
 */
@Machine('order-sync')
@MachineThrottle()
@Controller('machine/orders')
export class MachineOrderDocumentsController {
  constructor(
    private readonly orders: OrdersService,
    private readonly acts: OrderDocumentActs,
    private readonly settings: SettingsService,
  ) {}

  /**
   * The mirror of the refusal the admin panel meets (FR-ADM-10): a document is
   * the shop's statement about an order, and while the shop is answering its
   * own orders nobody else files one. The same pair the write-back has, so a
   * credential cannot reach past the switch by a different door.
   */
  private refuseUnlessOwned(): void {
    if (!this.settings.isExternallyOwned('orders')) {
      throw ordersNotExternallyOwned();
    }
  }

  /**
   * File a document against an order, replacing whatever was there of that
   * kind.
   *
   * `notify` is required rather than defaulted, as it is on the write-back and
   * for the same reason: whether the customer hears about this is the shop's
   * decision, and a default would quietly take it for them.
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
   * Take one back off — the correction for a file posted against the wrong
   * order or superseded by a reprint. It exists here because while the area is
   * owned there is nobody else who could: the admin panel's own delete is
   * refused under exactly this setting.
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
