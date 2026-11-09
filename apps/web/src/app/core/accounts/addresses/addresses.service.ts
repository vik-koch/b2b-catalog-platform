import { Injectable } from '@angular/core';
import { safe, type ClientPromiseResult } from '@orpc/client';

import {
  Address,
  AddressInput,
  AddressSuggestion,
} from '@b2b-catalog-platform/shared/core/accounts';

import { createOrpcClient } from '../../../platform/orpc-client';
import {
  addressesContract,
  addressSuggestionContract,
} from '../contract-routes.generated';

/** The refusals the form explains; any other error is thrown. */
export type SaveAddressResult =
  { ok: true; address: Address } | { ok: false; code: SaveAddressRefusal };

type SaveAddressRefusal =
  'address-limit-reached' | 'unsupported-country' | 'invalid-postal-code';

function explainable(code: string): code is SaveAddressRefusal {
  return (
    code === 'address-limit-reached' ||
    code === 'unsupported-country' ||
    code === 'invalid-postal-code'
  );
}

/** The account's address book, and the suggestions that fill one in. */
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

  async suggest(q: string, country?: string): Promise<AddressSuggestion[]> {
    const { error, data } = await safe(
      this.suggestions.suggestAddresses({
        query: country ? { q, country } : { q },
      }),
    );
    // A provider that is down must not take the form with it.
    return error ? [] : data.items;
  }
}
