import { inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AddressComponents, AddressInput } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

/**
 * One address being entered, wherever it is being entered: the account's own
 * editor, and the two pickers at checkout.
 *
 * The controls and the three things anybody ever does to them — fill from a
 * saved row, fill from a provider's suggestion, and read the whole thing back
 * as an `AddressInput` — kept together, because they have to agree about which
 * fields exist and how an empty one is spelled. Two call sites re-deriving
 * "blank means null" is how one of them saves an empty string as a street 2.
 *
 * An address is a place: no company, no registration number, no phone. Who an
 * order is invoiced to is the order's own answer, and the number a manager
 * rings is its contact.
 *
 * Not a component: a page owns its form (validity, submit, unsaved-changes),
 * and `AddressFields` only draws whatever group it is handed.
 */
export class AddressForm {
  private readonly countries =
    inject(DEPLOYMENT_CONFIG).address?.countries ?? [];

  readonly group = inject(FormBuilder).nonNullable.group({
    // Optional: an unnamed address is listed by its own first line, so nobody
    // has to invent a word for the only address they order to.
    label: [''],
    street: ['', Validators.required],
    street2: [''],
    postalCode: ['', Validators.required],
    city: ['', Validators.required],
    region: [''],
    country: [this.countries[0]?.code ?? ''],
  });

  /**
   * An address laid into the form — a saved row, or one recovered from a
   * checkout draft, which is why this takes the input shape rather than a
   * stored row. A reset rather than a patch: this is the form's new starting
   * point, so nothing may stay dirty from before it.
   */
  fill(address: AddressInput): void {
    this.group.reset({
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
   * provider actually answered are written — a partial answer must not blank
   * what the customer already typed — and the street line arrives already
   * composed, in the shape the provider's own jurisdiction prints it.
   */
  applySuggestion(components: AddressComponents): void {
    this.group.patchValue({
      ...(components.street ? { street: components.street } : {}),
      ...(components.postalCode ? { postalCode: components.postalCode } : {}),
      ...(components.city ? { city: components.city } : {}),
      // The apartment or office, where the provider parsed one out of what was
      // typed. It belongs on the second line: the street line is rewritten on
      // every pick, and this would not survive there.
      ...(components.unit ? { street2: components.unit } : {}),
      ...(components.region ? { region: components.region } : {}),
      ...(components.country &&
      this.countries.some((entry) => entry.code === components.country)
        ? { country: components.country }
        : {}),
    });
  }

  /**
   * The form as the contract wants it. Empty means absent, not an empty
   * string: the columns are nullable, and an address with a blank company name
   * is one without a company.
   */
  value(): AddressInput {
    const raw = this.group.getRawValue();
    const optional = (value: string) => value.trim() || null;
    return {
      label: optional(raw.label),
      street: raw.street.trim(),
      street2: optional(raw.street2),
      postalCode: raw.postalCode.trim(),
      city: raw.city.trim(),
      region: optional(raw.region),
      country: raw.country,
    };
  }
}

/** Must be called in an injection context — it reads the deployment's address
 * rules and builds its controls from them. */
export function createAddressForm(): AddressForm {
  return new AddressForm();
}
