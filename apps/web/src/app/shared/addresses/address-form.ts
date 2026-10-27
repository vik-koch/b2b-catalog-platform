import { computed, inject, signal } from '@angular/core';
import {
  form,
  maxLength,
  required,
  schema,
  validate,
  type FieldTree,
  type FormSubmitOptions,
  type Schema,
} from '@angular/forms/signals';
import {
  ADDRESS_LINE_MAX_LENGTH,
  AddressComponents,
  AddressInput,
  type DeploymentConfig,
  fillText,
  postalCodeMatches,
  postalCodeRuleFor,
} from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { STOREFRONT_TEXT } from '../config/storefront-text';

type Countries = NonNullable<DeploymentConfig['address']>['countries'];

/** An address as it is typed: every part a string, empty where absent. */
export interface AddressDraft {
  label: string;
  street: string;
  street2: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
}

/** An address nobody has typed yet, in the deployment's first country. */
export function blankAddress(countries: Countries | undefined): AddressDraft {
  return {
    // Optional: an unnamed address is listed by its own first line, so nobody
    // has to invent a word for the only address they order to.
    label: '',
    street: '',
    street2: '',
    postalCode: '',
    city: '',
    region: '',
    country: countries?.[0]?.code ?? '',
  };
}

/**
 * What an address has to answer, wherever it is typed: on its own, or as a
 * branch of a larger form (`apply(path.delivery, addressRules(…))`).
 *
 * The postcode's shape belongs to the country, so the rule reads the country
 * beside it and says the example of whichever is chosen. Empty is `required`'s
 * business: "wrong shape" about a field nobody has filled in answers a question
 * that was not asked.
 */
export function addressRules(
  text: { required: string; postalCodeFormat: string },
  countries: Countries | undefined,
): Schema<AddressDraft> {
  return schema<AddressDraft>((address) => {
    required(address.street, { message: text.required });
    maxLength(address.street, ADDRESS_LINE_MAX_LENGTH);
    required(address.postalCode, { message: text.required });
    validate(address.postalCode, ({ value, valueOf }) => {
      const code = value().trim();
      const rule = postalCodeRuleFor(valueOf(address.country), countries);
      if (!code || !rule || postalCodeMatches(code, rule)) return undefined;
      return {
        kind: 'postalCode',
        message: fillText(text.postalCodeFormat, { example: rule.example }),
      };
    });
    required(address.city, { message: text.required });
    // Always answered, by the deployment's first country; marked so the
    // select reads like the other answers it is asked beside.
    required(address.country);
  });
}

/**
 * One address being entered, wherever it is being entered: the account's own
 * editor, and the two pickers at checkout.
 *
 * The three things anybody ever does to one, kept beside its fields: fill it
 * from a saved row, fill it from a provider's suggestion, and read it back as
 * an `AddressInput`. Kept together because they have to agree about which
 * fields exist and how an empty one is spelled: two call sites re-deriving
 * "blank means null" is how one of them saves an empty string as a street 2.
 *
 * An address is a place: no company, no registration number, no phone. Who an
 * order is invoiced to is the order's own answer, and the number a manager
 * rings is its contact.
 *
 * Not a component: a page owns its form (validity, submit, unsaved changes),
 * and AddressFields only draws whatever address it is handed.
 */
export class AddressForm {
  constructor(
    readonly field: FieldTree<AddressDraft>,
    private readonly countries: Countries | undefined,
  ) {}

  /** The rule the chosen country asks for, where it has one. */
  readonly postalCodeRule = computed(() =>
    postalCodeRuleFor(this.field.country().value(), this.countries),
  );

  /**
   * An address laid into the form: a saved row, or one recovered from a
   * checkout draft, which is why this takes the input shape rather than a
   * stored row. A reset rather than a write: this is the form's new starting
   * point, so nothing may stay touched from before it.
   */
  fill(address: AddressInput): void {
    this.field().reset({
      label: address.label ?? '',
      street: address.street,
      street2: address.street2 ?? '',
      postalCode: address.postalCode,
      city: address.city,
      region: address.region ?? '',
      country: address.country,
    });
  }

  /**
   * A picked address suggestion, spread across the form. Only the parts the
   * provider actually answered are written, since a partial answer must not
   * blank what the customer already typed, and the street line arrives
   * already composed, in the shape the provider's own jurisdiction prints it.
   */
  applySuggestion(components: AddressComponents): void {
    const set = (
      part: keyof AddressDraft,
      value: string | null | undefined,
    ) => {
      if (value) this.field[part]().value.set(value);
    };
    set('street', components.street);
    set('postalCode', components.postalCode);
    set('city', components.city);
    // The apartment or office, where the provider parsed one out of what was
    // typed. It belongs on the second line: the street line is rewritten on
    // every pick, and this would not survive there.
    set('street2', components.unit);
    set('region', components.region);
    if (this.countries?.some((entry) => entry.code === components.country)) {
      set('country', components.country);
    }
  }

  /**
   * The form as the contract wants it. Empty means absent, not an empty
   * string: the columns are nullable, and an address with a blank second line
   * is one without one.
   */
  value(): AddressInput {
    const draft = this.field().value();
    const optional = (value: string) => value.trim() || null;
    return {
      label: optional(draft.label),
      street: draft.street.trim(),
      street2: optional(draft.street2),
      postalCode: draft.postalCode.trim(),
      city: draft.city.trim(),
      region: optional(draft.region),
      country: draft.country,
    };
  }
}

/**
 * An address that is a whole form of its own, as on the account's editor.
 * Must be called in an injection context: it reads the deployment's address
 * rules and the wording of their messages.
 */
export function createAddressForm(
  submission?: FormSubmitOptions<AddressDraft, unknown>,
): AddressForm {
  const countries = inject(DEPLOYMENT_CONFIG).address?.countries;
  const text = inject(STOREFRONT_TEXT).address;
  const field = form(
    signal(blankAddress(countries)),
    addressRules(text, countries),
    { name: 'address', submission },
  );
  return new AddressForm(field, countries);
}
