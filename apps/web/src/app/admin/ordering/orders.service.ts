import { DOCUMENT, Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import {
  OrderDocumentKind,
  OrderStatus,
  orderDocumentPath,
  AdminOrderDetail,
  OrderAdjustment,
  OrderAdjustmentPreview,
  AdminOrderDocument,
  OrderRevision,
  OrderRevisionEntry,
  StaffOrderSort,
  StaffPaymentFilter,
} from '@b2b-catalog-platform/shared/core/ordering';
import { StaffOrderSummary } from '@b2b-catalog-platform/shared/admin/ordering';
import { Pagination } from '@b2b-catalog-platform/shared/platform';
import { adminOrdersContract } from './contract-routes.generated';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../../platform/orpc-client';

/** Why an adjustment was refused (FR-ORD-03), as contract codes the screen
 * words. */
export type AdjustmentRefusal =
  | 'order-changed'
  | 'no-change'
  | 'unknown-product'
  | 'unknown-tier'
  | 'invalid-company-id'
  | 'unsupported-country'
  | 'invalid-postal-code'
  | 'unknown-pickup-location'
  | 'billing-details-required'
  | 'cash-not-available'
  | 'billing-address-required'
  | 'customer-type-not-accepted'
  | 'order-not-found';

export type AdjustmentResult =
  | { ok: true; order: AdminOrderDetail }
  | { ok: false; code: AdjustmentRefusal };

/** Staff's order routes (FR-AUTH-03): a projection carrying the price list, who
 * placed it and the lines' prices. */
@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly client = createOrpcClient(adminOrdersContract);
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  async list(query: {
    page: number;
    status?: OrderStatus;
    payment?: StaffPaymentFilter;
    q?: string;
    sort?: StaffOrderSort;
  }): Promise<{ items: StaffOrderSummary[]; pagination: Pagination }> {
    return this.client.listOrders({ query });
  }

  /** One order in full. Null where the reference opens nothing. */
  async get(reference: string): Promise<AdminOrderDetail | null> {
    const result = await safe(this.client.getOrder({ params: { reference } }));
    if (result.isDefined && result.error.code === 'order-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** Moves an order (FR-ORD-01/02). Null where refused: somebody else answered
   * first, and the page reloads. */
  async transition(
    reference: string,
    to: OrderStatus,
    reason: string | null,
    /** The confirmation's ticks: the customer's page, the mail, the money. */
    told: { showCustomer: boolean; notify: boolean; markPaid: boolean },
  ): Promise<AdminOrderDetail | null> {
    const result = await safe(
      this.client.transitionOrder({
        params: { reference },
        body: { to, reason, ...told },
      }),
    );
    if (result.isSuccess) return result.data;
    if (!result.isDefined) throw result.error;
    return null;
  }

  /** Brings the customer's page up to date, mailing if asked (FR-NOTIF-03).
   * Null where somebody else already did. */
  async notifyCustomer(
    reference: string,
    notify: boolean,
  ): Promise<AdminOrderDetail | null> {
    const result = await safe(
      this.client.notifyOrderCustomer({
        params: { reference },
        body: { notify },
      }),
    );
    if (result.isSuccess) return result.data;
    if (!result.isDefined) throw result.error;
    return null;
  }

  /** Every version, newest first (FR-ORD-03). */
  async revisions(
    reference: string | undefined,
  ): Promise<OrderRevisionEntry[]> {
    if (!reference) return [];
    const { revisions } = await this.client.listOrderRevisions({
      params: { reference },
    });
    return revisions;
  }

  /** Null where the order or that version is not there. */
  async revision(
    reference: string,
    number: number,
  ): Promise<OrderRevision | null> {
    const result = await safe(
      this.client.getOrderRevision({ params: { reference, number } }),
    );
    if (result.isDefined && result.error.code === 'order-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** What the adjustment would come to (FR-ORD-03), priced by the server.
   * Refusals as codes, so a rule shows while typing, not on save. */
  async previewAdjustment(
    reference: string,
    body: OrderAdjustment,
  ): Promise<
    | { ok: true; preview: OrderAdjustmentPreview }
    | { ok: false; code: AdjustmentRefusal }
  > {
    const result = await safe(
      this.client.previewOrderAdjustment({ params: { reference }, body }),
    );
    if (result.isSuccess) return { ok: true, preview: result.data };
    if (!result.isDefined) throw result.error;
    return { ok: false, code: result.error.code as AdjustmentRefusal };
  }

  /** Writes a new version (FR-ORD-03). */
  async adjust(
    reference: string,
    body: OrderAdjustment,
  ): Promise<AdjustmentResult> {
    const result = await safe(
      this.client.adjustOrder({ params: { reference }, body }),
    );
    if (result.isSuccess) return { ok: true, order: result.data };
    if (!result.isDefined) throw result.error;
    return { ok: false, code: result.error.code as AdjustmentRefusal };
  }

  /** Records the payment or takes it back (FR-ORD-04). Null where nothing
   * changed: already so, or the order ended. */
  async setPayment(
    reference: string,
    paid: boolean,
  ): Promise<AdminOrderDetail | null> {
    const result = await safe(
      this.client.setOrderPayment({ params: { reference }, body: { paid } }),
    );
    if (result.isSuccess) return result.data;
    if (!result.isDefined) throw result.error;
    return null;
  }

  /** Erases a finished guest order's personal details on request (NFR-
   * LEGAL-14). Null where refused: reopened, or done already. */
  async removePersonalData(
    reference: string,
  ): Promise<AdminOrderDetail | null> {
    const result = await safe(
      this.client.removeOrderPersonalData({ params: { reference } }),
    );
    if (result.isSuccess) return result.data;
    if (!result.isDefined) throw result.error;
    return null;
  }

  /** Files a document (FR-ORD-05): multipart, outside the contract, like every
   * upload. Telling the customer is the next call. */
  supplyDocument(
    reference: string,
    kind: OrderDocumentKind,
    file: File,
  ): Promise<AdminOrderDocument> {
    const form = new FormData();
    form.append('file', file);
    return lastValueFrom(
      this.http.post<AdminOrderDocument>(
        this.documentUrl(reference, kind),
        form,
      ),
    );
  }

  /** Tells the customer about a filed document (FR-ORD-05); repeatable for a
   * lost message. */
  notifyAboutDocument(
    reference: string,
    kind: OrderDocumentKind,
  ): Promise<void> {
    return lastValueFrom(
      this.http.post<void>(`${this.documentUrl(reference, kind)}/notify`, {}),
    );
  }

  /** The summary falls back to the generated one; payment instructions stop
   * existing. */
  removeDocument(reference: string, kind: OrderDocumentKind): Promise<void> {
    return lastValueFrom(
      this.http.delete<void>(this.documentUrl(reference, kind)),
    );
  }

  private documentUrl(reference: string, kind: OrderDocumentKind): string {
    return `${this.document.location.origin}${orderDocumentPath(kind, { reference })}`;
  }
}
