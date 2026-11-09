import { oc } from '@orpc/contract';
import * as z from 'zod';

import { acknowledgementSchema } from '../../platform/acknowledgement.contract';
import { commonAuthErrors } from '../../platform/api-error';
import {
  ADDRESS_LABEL_MAX_LENGTH,
  ADDRESS_LINE_MAX_LENGTH,
  ADDRESS_POSTAL_CODE_MAX_LENGTH,
  ADDRESS_QUERY_MAX_LENGTH,
} from './address';

/** How many addresses one account may keep: a bound against an endpoint with
 * no ceiling, not a business rule. */
export const ADDRESS_BOOK_MAX = 50;

/** ISO 3166-1 alpha-2, uppercase: a code, because it is copied onto orders
 * and has to group. Which codes a deployment accepts is its configuration. */
export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/);

/**
 * A place and nothing else: `street` carries the house number as printed,
 * `street2` the extra line (floor, care-of). No company or phone: those are
 * the order's own fields (FR-CART-09). Without a `label`, the address is named
 * by its first line.
 */
export const addressInputSchema = z
  .object({
    label: z.string().trim().min(1).max(ADDRESS_LABEL_MAX_LENGTH).nullable(),
    street: z.string().trim().min(1).max(ADDRESS_LINE_MAX_LENGTH),
    street2: z.string().trim().min(1).max(ADDRESS_LINE_MAX_LENGTH).nullable(),
    postalCode: z.string().trim().min(1).max(ADDRESS_POSTAL_CODE_MAX_LENGTH),
    city: z.string().trim().min(1).max(ADDRESS_LINE_MAX_LENGTH),
    region: z.string().trim().min(1).max(ADDRESS_LINE_MAX_LENGTH).nullable(),
    country: countryCodeSchema,
  })
  // strict: unknown keys are rejected, not stripped (NFR-SEC-05).
  .strict();
export type AddressInput = z.infer<typeof addressInputSchema>;

/** A stored row, as the book lists it. */
export const addressSchema = addressInputSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Address = z.infer<typeof addressSchema>;

/**
 * What a provider gives back: components, never one line, because the delivery
 * zone keys off the postal code. Every part is optional, as providers answer at
 * different granularities.
 *
 * This is the sidecar contract, parsed strictly: the platform learns a field
 * before a sidecar sends it, and a sidecar stops sending one before it goes.
 */
export const addressComponentsSchema = z
  .object({
    country: countryCodeSchema.optional(),
    postalCode: z.string().max(ADDRESS_POSTAL_CODE_MAX_LENGTH).optional(),
    region: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    city: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    /** The street line as printed (`Hafenstraße 12`). The adapter composes it:
     * where the number goes is regional typography. */
    street: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    /** Apartment, office or suite, where the provider parsed one. It fills the
     * second line, so a later pick rewriting the street keeps it. */
    unit: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
  })
  .strict();
export type AddressComponents = z.infer<typeof addressComponentsSchema>;

/** One row of the dropdown: what to show, and what picking it fills in. */
export const addressSuggestionSchema = z
  .object({
    /** The provider's own one-line rendering, for display only. */
    label: z.string(),
    components: addressComponentsSchema,
  })
  .strict();
export type AddressSuggestion = z.infer<typeof addressSuggestionSchema>;

/** The signed-in account's address book. Scoped to the session's own user, so
 * no route takes an account id to get wrong. */
const account = oc.errors(commonAuthErrors);

/** What a saved address can be refused for. */
const addressErrors = {
  'address-not-found': { status: 404 },
  /** The book is full. */
  'address-limit-reached': { status: 409 },
  /** Not a country this deployment ships to. */
  'unsupported-country': { status: 409 },
  /** Not the shape that country's postal codes take. */
  'invalid-postal-code': { status: 409 },
} as const;

export const addressesContract = {
  listAddresses: account
    .route({
      method: 'GET',
      path: '/account/addresses',
      summary: "The signed-in account's saved addresses",
    })
    .output(z.object({ items: z.array(addressSchema) })),

  createAddress: account
    .route({
      method: 'POST',
      path: '/account/addresses',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Save a new address',
    })
    .errors({
      'address-limit-reached': addressErrors['address-limit-reached'],
      'unsupported-country': addressErrors['unsupported-country'],
      'invalid-postal-code': addressErrors['invalid-postal-code'],
    })
    .input(z.object({ body: addressInputSchema }))
    .output(addressSchema),

  updateAddress: account
    .route({
      method: 'PUT',
      path: '/account/addresses/{id}',
      inputStructure: 'detailed',
      summary: 'Correct a saved address',
    })
    .errors({
      'address-not-found': addressErrors['address-not-found'],
      'unsupported-country': addressErrors['unsupported-country'],
      'invalid-postal-code': addressErrors['invalid-postal-code'],
    })
    .input(
      z.object({
        params: z.object({ id: z.string() }),
        body: addressInputSchema,
      }),
    )
    .output(addressSchema),

  deleteAddress: account
    .route({
      method: 'DELETE',
      path: '/account/addresses/{id}',
      inputStructure: 'detailed',
      summary: 'Remove a saved address',
    })
    .errors({ 'address-not-found': addressErrors['address-not-found'] })
    .input(z.object({ params: z.object({ id: z.string() }) }))
    .output(acknowledgementSchema),
};

/**
 * Address suggestion (FR-CART-11), proxied so the provider credential stays
 * server-side (NFR-SEC-08). Open to guests, who fill the same form at
 * checkout. Without an adapter the list is empty and the field is plain typing.
 */
export const addressSuggestionContract = {
  suggestAddresses: oc
    .route({
      method: 'GET',
      path: '/addresses/suggestions',
      inputStructure: 'detailed',
      summary: 'Addresses matching what the customer is typing',
    })
    .input(
      z.object({
        query: z.object({
          q: z.string().trim().min(1).max(ADDRESS_QUERY_MAX_LENGTH),
          /** Bias the provider; the deployment's default where absent. */
          country: countryCodeSchema.optional(),
        }),
      }),
    )
    .output(z.object({ items: z.array(addressSuggestionSchema) })),
};
