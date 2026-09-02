import { Injectable } from '@angular/core';
import { inquiryContract, InquiryRequest } from '@b2b-catalog-platform/shared';
import { createOrpcClient } from '../core/orpc-client';

@Injectable({ providedIn: 'root' })
export class InquiryService {
  private client = createOrpcClient(inquiryContract);

  /** Posts the inquiry; resolves on success, throws on anything else. */
  async submit(body: InquiryRequest): Promise<void> {
    await this.client.submit({ body });
  }
}
