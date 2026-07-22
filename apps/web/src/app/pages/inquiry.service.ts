import { Injectable } from '@angular/core';
import { inquiryContract, InquiryRequest } from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

@Injectable({ providedIn: 'root' })
export class InquiryService {
  private client = createApiClient(inquiryContract);

  /** Posts the inquiry; resolves on success, throws on any non-200. */
  async submit(body: InquiryRequest): Promise<void> {
    const response = await this.client.submit({ body });

    if (response.status === 200) {
      return;
    }

    throw new Error(`Inquiry submission failed (status ${response.status})`);
  }
}
