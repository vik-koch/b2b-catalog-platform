import * as z from 'zod';
import type { DeepReadonly } from '../../platform/deep-readonly';

/** A suggestion list under a field: its name, what it says when nothing
 * matches, and `{count}` for the live region. */
const suggestText = z
  .object({
    suggestionsAria: z.string(),
    noSuggestions: z.string(),
    suggestionCountAria: z.string(),
  })
  .strict();

/** The accounts' block of `texts/shared.json`: what their views say in both
 * audiences, the storefront's forms and the admin's alike. */
export const sharedAccountsTextShape = {
  /** Whether a customer or an order's party is a private person or a
   * company. */
  partyKind: z.object({ person: z.string(), company: z.string() }).strict(),
  /** Who is signed in, on /account and /admin. `greeting` carries `{name}`:
   * the first name, or the address where the account has none. */
  signedInAs: z.object({ greeting: z.string(), logout: z.string() }).strict(),
  /** The company search under a registration number field. */
  companySuggest: suggestText,
  /**
   * The address fields, in every form that asks for one. An address is a
   * place and carries no identity: who is invoiced is the order's question.
   * The suggestion wording is here even where no provider is configured, as
   * the file loads whole either way.
   */
  address: z
    .object({
      /** The address's own name, for a book that keeps several. */
      label: z.string(),
      labelHint: z.string(),
      /** Opens the full address fields where the form asked for the street
       * alone. Always offered, never only after a provider fails. */
      enterManually: z.string(),
      /** The one field a suggesting form asks for before anything is
       * picked: it takes the whole address, so it is not called the street. */
      addressLine: z.string(),
      street: z.string(),
      street2: z.string(),
      postalCode: z.string(),
      city: z.string(),
      region: z.string(),
      country: z.string(),
      required: z.string(),
      /** `{example}`: a real code in this country's shape, from the
       * deployment's postal rule. */
      postalCodeFormat: z.string(),
      /** The suggestion combobox (FR-CART-11). */
      suggest: suggestText,
    })
    .strict(),
};

export type SharedAccountsText = DeepReadonly<
  z.infer<z.ZodObject<typeof sharedAccountsTextShape>>
>;
