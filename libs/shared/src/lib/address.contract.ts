import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { apiErrorSchema, commonAuthErrorSchema } from './api-error';
import { companyRegistrationIdSchema } from './auth.contract';

const c = initContract();

/**
 * The address book (FR-CART-04) which lives here rather than on the account
 * contract: a guest checks out with an address too, so only the *book*
 * is account-scoped.
 */

/** An optional short name for the row, to tell two addresses apart. */
export const ADDRESS_LABEL_MAX_LENGTH = 100;
/** Matches the varchar the columns carry; a bound, not an editorial rule. */
export const ADDRESS_LINE_MAX_LENGTH = 255;
export const ADDRESS_POSTAL_CODE_MAX_LENGTH = 32;
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
 * What an address is made of. `street` carries the house number, as the line is
 * printed; `street2` is the extra line (floor, care-of) and `region` the
 * province where a jurisdiction needs one — a deployment that has no use for it
 * hides the field and never sends it.
 *
 * `companyName` and `companyId` describe the party being **invoiced**, and are
 * per address rather than read off the account: the registration number on the
 * account is what staff approved it on, and an invoice may perfectly well go to
 * another of the customer's entities. They prefill from the account at the
 * form, never by foreign key.
 *
 * `label` is optional: an address is recognisable as itself, and a customer
 * saving the one address they order to should not have to invent a word for it.
 * Where it is absent, the address is named by its own first line.
 *
 * Both company fields are optional here even though bank transfer needs them.
 * A row is not typed as billing or delivery — the same address usually serves
 * both, and only the invoiced role needs a company — so the requirement belongs
 * to the order being submitted, not to the address being saved.
 */
export const addressInputSchema = z
  .object({
    label: z.string().trim().min(1).max(ADDRESS_LABEL_MAX_LENGTH).nullable(),
    companyName: z
      .string()
      .trim()
      .min(1)
      .max(ADDRESS_LINE_MAX_LENGTH)
      .nullable(),
    /** The same envelope registration uses; the deployment's own formats are
     * applied on top, by the API as well as the browser. */
    companyId: companyRegistrationIdSchema.nullable(),
    street: z.string().trim().min(1).max(ADDRESS_LINE_MAX_LENGTH),
    street2: z.string().trim().min(1).max(ADDRESS_LINE_MAX_LENGTH).nullable(),
    postalCode: z.string().trim().min(1).max(ADDRESS_POSTAL_CODE_MAX_LENGTH),
    city: z.string().trim().min(1).max(ADDRESS_LINE_MAX_LENGTH),
    region: z.string().trim().min(1).max(ADDRESS_LINE_MAX_LENGTH).nullable(),
    country: countryCodeSchema,
    phone: z.string().trim().min(1).max(50).nullable(),
  })
  // strict: unknown keys are rejected, not stripped (NFR-SEC-05).
  .strict();
export type AddressInput = z.infer<typeof addressInputSchema>;

/** A stored row, as the book lists it. */
export const addressSchema = addressInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Address = z.infer<typeof addressSchema>;

/**
 * What a provider gives back (ADR 0040): components, never one formatted line.
 * The delivery-zone rule keys off the postal code, so a single line would have
 * to be parsed back into what the provider already knew. Every part is optional
 * — providers answer at different granularities, and a partial answer still
 * fills most of the form.
 */
export const addressComponentsSchema = z
  .object({
    country: countryCodeSchema.optional(),
    postalCode: z.string().max(ADDRESS_POSTAL_CODE_MAX_LENGTH).optional(),
    region: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    city: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    street: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
    house: z.string().max(ADDRESS_LINE_MAX_LENGTH).optional(),
  })
  .strict();
export type AddressComponents = z.infer<typeof addressComponentsSchema>;

/**
 * The signed-in account's address book. Every route is scoped to the session's
 * own user, so no route takes an account id — there is no "may I see this one"
 * question to get wrong.
 */
export const addressesContract = c.router({
  listAddresses: {
    method: 'GET',
    path: '/account/addresses',
    responses: {
      200: z.object({ items: z.array(addressSchema) }),
      401: commonAuthErrorSchema,
    },
    summary: "The signed-in account's saved addresses",
  },
  createAddress: {
    method: 'POST',
    path: '/account/addresses',
    body: addressInputSchema,
    responses: {
      201: addressSchema,
      401: commonAuthErrorSchema,
      /** The registration number does not match any configured format. */
      400: apiErrorSchema(['invalid-company-id']),
      /** The book is full, or the country is not one this deployment ships to. */
      409: apiErrorSchema(['address-limit-reached', 'unsupported-country']),
    },
    summary: 'Save a new address',
  },
  updateAddress: {
    method: 'PUT',
    path: '/account/addresses/:id',
    body: addressInputSchema,
    responses: {
      200: addressSchema,
      400: apiErrorSchema(['invalid-company-id']),
      401: commonAuthErrorSchema,
      404: apiErrorSchema(['address-not-found']),
      409: apiErrorSchema(['unsupported-country']),
    },
    summary: 'Correct a saved address',
  },
  deleteAddress: {
    method: 'DELETE',
    path: '/account/addresses/:id',
    responses: {
      200: z.object({ message: z.string() }),
      401: commonAuthErrorSchema,
      404: apiErrorSchema(['address-not-found']),
    },
    summary: 'Remove a saved address',
  },
});
