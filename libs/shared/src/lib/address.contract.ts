import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  ADDRESS_LABEL_MAX_LENGTH,
  ADDRESS_LINE_MAX_LENGTH,
  ADDRESS_POSTAL_CODE_MAX_LENGTH,
  ADDRESS_QUERY_MAX_LENGTH,
  ADDRESS_QUERY_MIN_LENGTH,
} from './address-constants';
import { commonAuthErrors } from './api-error';

/**
 * How many addresses one account may keep. A bound, not a business rule: a
 * customer orders to a handful of places, and an unbounded book is a write
 * endpoint with no ceiling.
 */
export const ADDRESS_BOOK_MAX = 50;

/**
 * ISO 3166-1 alpha-2, uppercase. A code rather than free text because it is
 * snapshotted onto orders, and a column that reads `DE` on one and
 * `Deutschland` on the next is one nobody can group by. Which codes a
 * deployment accepts is its own configuration; the shape is the same
 * everywhere.
 */
export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/);

/**
 * What an address is made of — a **place**, and nothing else. `street` carries
 * the house number, as the line is printed; `street2` is the extra line (floor,
 * care-of) and `region` the province where a jurisdiction has one, which a
 * suggestion provider usually fills without anybody typing it.
 *
 * No company name, no registration number and no phone. Who an order is
 * invoiced to is the order's own field, resolved from the account or typed at
 * checkout (FR-CART-09), and the number a manager rings is the order's
 * `contact` — carrying either here as well would be a second place for a fact
 * stated somewhere authoritative, free to disagree with it.
 *
 * `label` is optional: an address is recognisable as itself, and a customer
 * saving the one address they order to should not have to invent a word for it.
 * Where it is absent, the address is named by its own first line.
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
 * What a provider gives back (ADR 0040): components, never one formatted line.
 * The delivery-zone rule keys off the postal code, so a single line would have
 * to be parsed back into what the provider already knew. Every part is optional
 * — providers answer at different granularities, and a partial answer still
 * fills most of the form.
 *
 * Adding a component here is a change to the sidecar contract (ADR 0040): the
 * API parses an adapter's answer strictly, so the platform learns a field
 * before a sidecar may send one — and removing one runs the other way round,
 * the sidecar stopping first.
 */
export const addressComponentsSchema = z
  .object({
    country: countryCodeSchema.optional(),
    postalCode: z.string().max(ADDRESS_POSTAL_CODE_MAX_LENGTH).optional(),
    region: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    city: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    /**
     * The street line **as it is printed** (`Hafenstraße 12`), house number
     * included. Composed by the adapter rather than here: whether the number
     * leads or follows, what separates it from the street, and whether either
     * carries a word naming its type are all regional typography — a separator
     * chosen in shared code would be one jurisdiction's habit imposed on every
     * other.
     */
    street: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    /**
     * Apartment, office or suite, where the provider parsed one out of what was
     * typed. It fills the second address line rather than the street: the
     * street line is the provider's to rewrite on every pick, and what is
     * inside the building must survive that.
     */
    unit: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
  })
  .strict();
export type AddressComponents = z.infer<typeof addressComponentsSchema>;

/** One row of the dropdown: what to show, and what picking it fills in. */
export const addressSuggestionSchema = z
  .object({
    /** The provider's own one-line rendering — display only. */
    label: z.string(),
    components: addressComponentsSchema,
  })
  .strict();
export type AddressSuggestion = z.infer<typeof addressSuggestionSchema>;

/**
 * The signed-in account's address book. Every route is scoped to the session's
 * own user, so no route takes an account id — there is no "may I see this one"
 * question to get wrong.
 */
/** Every route on the address book belongs to the signed-in account. */
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
    .output(z.object({ message: z.string() })),
};

/**
 * Address suggestion (FR-CART-11), proxied so the provider credential stays
 * server-side (NFR-SEC-08). Unauthenticated on purpose: a guest fills the same
 * form at checkout. A deployment with no adapter configured answers with an
 * empty list, which is what makes the field degrade to plain typing.
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
