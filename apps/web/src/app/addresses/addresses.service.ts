import { Injectable } from '@angular/core';
import {
  Address,
  AddressInput,
  AddressSuggestion,
} from '@b2b-catalog-platform/shared';
import {
  addressSuggestionContract,
  addressesContract,
} from '../core/contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../core/orpc-client';

/** The refusals the address form has to explain rather than throw. */
export type SaveAddressResult =
  { ok: true; address: Address } | { ok: false; code: SaveAddressRefusal };

type SaveAddressRefusal =
  'address-limit-reached' | 'unsupported-country' | 'invalid-postal-code';

/**
 * Both writes also declare the two auth refusals and, on an update, a gone
 * address — none of which this form phrases: they mean the session or the row
 * is wrong rather than the input.
 */
function explainable(code: string): code is SaveAddressRefusal {
  return (
    code === 'address-limit-reached' ||
    code === 'unsupported-country' ||
    code === 'invalid-postal-code'
  );
}

/**
 * The account's address book, and the suggestions that fill one in. One service
 * for both, as on the API: the book is account-scoped and the suggestions are
 * not, but they are the same subject and the same form uses both.
 */
@Injectable({ providedIn: 'root' })
export class AddressesService {
  private readonly client = createOrpcClient(addressesContract);
  private readonly suggestions = createOrpcClient(addressSuggestionContract);

  async list(): Promise<Address[]> {
    return (await this.client.listAddresses()).items;
  }

  create(input: AddressInput): Promise<SaveAddressResult> {
    return this.saved(this.client.createAddress({ body: input }));
  }

  update(id: string, input: AddressInput): Promise<SaveAddressResult> {
    return this.saved(
      this.client.updateAddress({ params: { id }, body: input }),
    );
  }

  private async saved<TError extends Error>(
    call: ClientPromiseResult<Address, TError>,
  ): Promise<SaveAddressResult> {
    const result = await safe(call);
    if (result.isDefined && explainable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, address: result.data };
  }

  async remove(id: string): Promise<void> {
    const { error, isDefined } = await safe(
      this.client.deleteAddress({ params: { id } }),
    );
    // Already gone is what the caller wanted.
    if (isDefined && error.code === 'address-not-found') return;
    if (error) throw error;
  }

  /**
   * Addresses matching what is being typed (FR-CART-11). A deployment with no
   * adapter configured answers with an empty list, so the field simply never
   * offers anything — there is nothing here to switch on.
   */
  async suggest(q: string, country?: string): Promise<AddressSuggestion[]> {
    const { error, data } = await safe(
      this.suggestions.suggestAddresses({
        query: country ? { q, country } : { q },
      }),
    );
    // A suggestion is an accelerator, never a step: a provider that is down or
    // rate-limiting must not take the form down with it.
    return error ? [] : data.items;
  }
}
