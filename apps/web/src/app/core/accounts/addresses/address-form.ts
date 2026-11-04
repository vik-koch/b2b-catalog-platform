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
  type DeploymentConfig,
  fillText,
} from '@b2b-catalog-platform/shared/platform';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import {
  ADDRESS_LINE_MAX_LENGTH,
  AddressComponents,
  AddressInput,
  postalCodeMatches,
  postalCodeRuleFor,
} from '@b2b-catalog-platform/shared/core/accounts';

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
 * The rules in the deployment's countries and wording, also for an address
 * that is a branch of a larger form. Needs an injection context. The
 * postcode's shape is the chosen country's; empty is `required`'s.
 */
export function injectAddressRules(): Schema<AddressDraft> {
  const text = inject(STOREFRONT_TEXT).address;
  const countries = inject(DEPLOYMENT_CONFIG).address?.countries;
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
    // Always answered by the first country; marked to read like its neighbours.
    required(address.country);
  });
}

/**
 * An address being entered, with the three ways in and out of it kept beside
 * the fields, so they agree on which fields exist and that blank means absent.
 * Not a component: the page owns its form, AddressFields only draws it.
 */
export class AddressForm {
  constructor(
    readonly field: FieldTree<AddressDraft>,
    private readonly countries: Countries | undefined,
  ) {}

  readonly postalCodeRule = computed(() =>
    postalCodeRuleFor(this.field.country().value(), this.countries),
  );

  /**
   * A saved row or a checkout draft's address. A reset, not a write: nothing
   * may stay touched from before.
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

  /** Only the parts the provider answered, so a partial answer keeps what
   * was typed. */
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
    // On line 2: the street line is rewritten on every pick.
    set('street2', components.unit);
    set('region', components.region);
    if (this.countries?.some((entry) => entry.code === components.country)) {
      set('country', components.country);
    }
  }

  /** Blank optional parts become null: the columns are nullable. */
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

/** An address that is a whole form of its own. Needs an injection context. */
export function createAddressForm(
  submission?: FormSubmitOptions<AddressDraft, unknown>,
): AddressForm {
  const countries = inject(DEPLOYMENT_CONFIG).address?.countries;
  const field = form(signal(blankAddress(countries)), injectAddressRules(), {
    name: 'address',
    submission,
  });
  return new AddressForm(field, countries);
}
