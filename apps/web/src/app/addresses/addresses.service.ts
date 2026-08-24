import { Injectable } from '@angular/core';
import {
  Address,
  addressesContract,
  AddressInput,
  AddressSuggestion,
  addressSuggestionContract,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/** The refusals the address form has to explain rather than throw. */
export type SaveAddressResult =
  | { ok: true; address: Address }
  | {
      ok: false;
      code:
        | 'address-limit-reached'
        | 'unsupported-country'
        | 'invalid-company-id';
    };

/**
 * The account's address book, and the suggestions that fill one in. One service
 * for both, as on the API: the book is account-scoped and the suggestions are
 * not, but they are the same subject and the same form uses both.
 */
@Injectable({ providedIn: 'root' })
export class AddressesService {
  private readonly client = createApiClient(addressesContract);
  private readonly suggestions = createApiClient(addressSuggestionContract);

  async list(): Promise<Address[]> {
    const response = await this.client.listAddresses();
    if (response.status === 200) return response.body.items;
    throw new Error(`Failed to load addresses (status ${response.status})`);
  }

  async create(input: AddressInput): Promise<SaveAddressResult> {
    const response = await this.client.createAddress({ body: input });
    if (response.status === 201) return { ok: true, address: response.body };
    // 400 as well as 409: a number the deployment's formats refuse is the
    // customer's to correct, not an error to throw at them.
    if (response.status === 400 || response.status === 409) {
      return { ok: false, code: response.body.code };
    }
    throw new Error(`Failed to save the address (status ${response.status})`);
  }

  async update(id: string, input: AddressInput): Promise<SaveAddressResult> {
    const response = await this.client.updateAddress({
      params: { id },
      body: input,
    });
    if (response.status === 200) return { ok: true, address: response.body };
    if (response.status === 400 || response.status === 409) {
      return { ok: false, code: response.body.code };
    }
    throw new Error(`Failed to save the address (status ${response.status})`);
  }

  async remove(id: string): Promise<void> {
    const response = await this.client.deleteAddress({ params: { id } });
    // A 404 means it is already gone, which is what the caller wanted.
    if (response.status === 200 || response.status === 404) return;
    throw new Error(`Failed to remove the address (status ${response.status})`);
  }

  /**
   * Addresses matching what is being typed (FR-CART-11). A deployment with no
   * adapter configured answers with an empty list, so the field simply never
   * offers anything — there is nothing here to switch on.
   */
  async suggest(q: string, country?: string): Promise<AddressSuggestion[]> {
    const response = await this.suggestions.suggestAddresses({
      query: country ? { q, country } : { q },
    });
    // A suggestion is an accelerator, never a step: a provider that is down or
    // rate-limiting must not take the form down with it.
    return response.status === 200 ? response.body.items : [];
  }
}
