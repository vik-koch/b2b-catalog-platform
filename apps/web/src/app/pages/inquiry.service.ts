import { Injectable } from '@angular/core';
import { safe } from '@orpc/client';
import {
  ConsentRefusalCode,
  InquiryRequest,
} from '@b2b-catalog-platform/shared';
import { inquiryContract } from '../core/contract-routes.generated';
import { createOrpcClient } from '../core/orpc-client';

@Injectable({ providedIn: 'root' })
export class InquiryService {
  private client = createOrpcClient(inquiryContract);

  /** A consent refusal by its code; anything else that fails is `error`. */
  async submit(
    body: InquiryRequest,
  ): Promise<'ok' | 'error' | ConsentRefusalCode> {
    const result = await safe(this.client.submit({ body }));
    if (result.isSuccess) return 'ok';
    return result.isDefined ? result.error.code : 'error';
  }
}
