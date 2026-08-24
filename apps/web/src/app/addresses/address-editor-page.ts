import { Component, effect, inject, resource, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Address,
  AddressComponents,
  AddressInput,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { AccountService } from '../account/account.service';
import {
  canonicalPhone,
  companyIdFormat,
  phoneValidators,
  typedPhone,
} from '../core/contact-fields';
import { delayedLoading } from '../core/delayed-loading';
import { FieldErrors } from '../core/form-errors';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { CompanyIdField } from '../ui/company-id-field';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { PhoneField } from '../ui/phone-field';
import { SelectField } from '../ui/select-field';
import { Skeleton } from '../ui/skeleton';
import { AddressSuggestField } from './address-suggest-field';
import { AddressesService, SaveAddressResult } from './addresses.service';

type Status = 'idle' | 'submitting' | 'error';

/**
 * Adding or correcting one saved address (FR-CART-04). One screen for both,
 * like the admin editors: `/account/addresses/new` and
 * `/account/addresses/:id/edit`.
 *
 * The street field suggests as it is typed where the deployment configures a
 * provider (FR-CART-11); picking one fills the rest of the address, and every
 * field stays editable afterwards — a provider is an accelerator, never an
 * authority.
 */
@Component({
  selector: 'app-address-editor-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AddressSuggestField,
    Button,
    CompanyIdField,
    FieldLabel,
    Input,
    PhoneField,
    SelectField,
    Skeleton,
  ],
  template: `
    <div class="max-w-xl">
      <h1 class="mb-2 text-3xl font-bold tracking-tight">
        {{ isNew ? text.newHeading : text.editHeading }}
      </h1>
      <p class="mb-8 text-muted">{{ text.intro }}</p>

      @if (ready()) {
        <form
          class="space-y-6"
          novalidate
          (ngSubmit)="submit()"
          [formGroup]="form"
        >
          <div>
            <label for="label" appFieldLabel>
              {{ text.label }}
              <span class="font-normal text-subtle">({{ text.optional }})</span>
            </label>
            <input
              id="label"
              type="text"
              formControlName="label"
              appInput
              class="w-full"
            />
            <p class="mt-1 text-sm text-muted">{{ text.labelHint }}</p>
          </div>

          <!-- The invoice party. Prefilled from the account when adding, and
               editable: the registration number staff approved the account on
               is not necessarily the entity an invoice goes to. -->
          <div>
            <label for="companyName" appFieldLabel>
              {{ text.companyName }}
              <span class="font-normal text-subtle">({{ text.optional }})</span>
            </label>
            <input
              id="companyName"
              type="text"
              formControlName="companyName"
              autocomplete="organization"
              appInput
              class="w-full"
            />
          </div>

          <!-- The same field registration uses, and the same rule — one
               jurisdiction, one set of accepted shapes. Optional here: an
               address invoiced to a natural person has no number. -->
          <app-company-id-field
            inputId="companyId"
            [control]="form.controls.companyId"
            [label]="text.companyId"
            [text]="companyIdText"
            [required]="false"
            [optionalLabel]="text.optional"
            [invalid]="isInvalid('companyId')"
          />

          <app-address-suggest-field
            [control]="form.controls.street"
            [label]="text.street"
            [text]="suggestText"
            [country]="form.controls.country.value"
            [invalid]="isInvalid('street')"
            (picked)="fillFrom($event)"
          />
          @if (isInvalid('street')) {
            <p class="-mt-4 text-sm text-red-600">{{ text.required }}</p>
          }

          <div>
            <label for="street2" appFieldLabel>
              {{ text.street2 }}
              <span class="font-normal text-subtle">({{ text.optional }})</span>
            </label>
            <input
              id="street2"
              type="text"
              formControlName="street2"
              autocomplete="address-line2"
              appInput
              class="w-full"
            />
          </div>

          <div class="grid gap-6 sm:grid-cols-[10rem_1fr]">
            <div>
              <label for="postalCode" appFieldLabel>
                {{ text.postalCode }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <input
                id="postalCode"
                type="text"
                formControlName="postalCode"
                autocomplete="postal-code"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('postalCode') || null"
              />
              @if (isInvalid('postalCode')) {
                <p class="mt-1 text-sm text-red-600">{{ text.required }}</p>
              }
            </div>

            <div>
              <label for="city" appFieldLabel>
                {{ text.city }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <input
                id="city"
                type="text"
                formControlName="city"
                autocomplete="address-level2"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('city') || null"
              />
              @if (isInvalid('city')) {
                <p class="mt-1 text-sm text-red-600">{{ text.required }}</p>
              }
            </div>
          </div>

          <!-- Always asked for, though rarely typed by hand: a suggestion
               fills it, and what it fills is printed on the address. -->
          <div>
            <label for="region" appFieldLabel>
              {{ text.region }}
              <span class="font-normal text-subtle">({{ text.optional }})</span>
            </label>
            <input
              id="region"
              type="text"
              formControlName="region"
              autocomplete="address-level1"
              appInput
              class="w-full"
            />
          </div>

          <!-- Nothing to ask where the deployment ships to one country: the
               single configured code is used, and the server still checks it. -->
          @if (countries.length > 1) {
            <div>
              <label for="country" appFieldLabel>
                {{ text.country }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <app-select-field class="max-w-72">
                <select
                  id="country"
                  formControlName="country"
                  autocomplete="country"
                  appInput
                  class="w-full"
                >
                  @for (option of countries; track option.code) {
                    <option [value]="option.code">{{ option.label }}</option>
                  }
                </select>
              </app-select-field>
            </div>
          }

          <app-phone-field
            [control]="form.controls.phone"
            [label]="text.phone"
            [text]="phoneText"
            [invalid]="isInvalid('phone')"
          />

          <div class="flex flex-wrap items-center gap-3">
            <button appButton type="submit" [disabled]="submitting()">
              {{ submitting() ? text.submitting : text.submit }}
            </button>
            <a appButton variant="secondary" routerLink="/account">
              {{ text.cancel }}
            </a>
          </div>

          @if (error()) {
            <p class="text-sm text-red-600" role="alert">{{ error() }}</p>
          }
        </form>
      } @else if (notFound()) {
        <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="6" />
      }
    </div>
  `,
})
export class AddressEditorPage {
  private readonly fb = inject(FormBuilder);
  private readonly addresses = inject(AddressesService);
  private readonly account = inject(AccountService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly text = inject(APP_TEXT).auth.myAccount.addresses;
  private readonly validation = inject(APP_TEXT).auth.register.validation;
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  protected readonly countries =
    inject(DEPLOYMENT_CONFIG).address?.countries ?? [];

  private readonly companyIdInput = inject(DEPLOYMENT_CONFIG).companyIdInput;

  protected readonly phoneText = {
    required: this.validation.phoneRequired,
    incomplete: this.validation.phoneIncomplete,
  };
  protected readonly companyIdText = {
    format: this.validation.companyIdFormat,
    hint: this.text.companyIdHint,
  };
  protected readonly suggestText = {
    suggestionsLabel: this.text.suggestionsLabel,
    noSuggestions: this.text.noSuggestions,
    suggestionCount: this.text.suggestionCount,
  };

  private readonly addressId = this.route.snapshot.paramMap.get('id');
  protected readonly isNew = this.addressId === null;

  protected readonly status = signal<Status>('idle');
  protected readonly error = signal<string | null>(null);
  protected readonly notFound = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    // Optional: an unnamed address is listed by its own first line, so nobody
    // has to invent a word for the only address they order to.
    label: [''],
    companyName: [''],
    companyId: ['', companyIdFormat(this.companyIdInput?.formats)],
    street: ['', Validators.required],
    street2: [''],
    postalCode: ['', Validators.required],
    city: ['', Validators.required],
    region: [''],
    country: [this.countries[0]?.code ?? ''],
    phone: ['', phoneValidators(this.phoneInput, false)],
  });

  protected readonly fieldErrors = new FieldErrors(this.form);

  /**
   * The row being corrected. There is no read-one endpoint — the book is a
   * short list the account already has — so an edit reads the list and finds
   * itself in it, and a new address asks for nothing.
   */
  private readonly saved = resource({
    params: () => this.addressId ?? undefined,
    loader: () => this.addresses.list(),
  });
  /**
   * Only to prefill the invoice party on a new address, and by value rather
   * than by foreign key: the number staff approved the account on is evidence
   * for that decision, and this address is free to carry a different one.
   */
  private readonly profile = resource({
    params: () => (this.isNew ? true : undefined),
    loader: () => this.account.getProfile(),
  });
  protected readonly showSkeleton = delayedLoading(this.saved.isLoading);
  protected readonly ready = () =>
    (this.isNew || this.saved.hasValue()) && !this.notFound();

  constructor() {
    // A new address starts from what the account already said: the same person,
    // usually the same company, reachable on the same number.
    effect(() => {
      const profile = this.profile.value();
      if (!profile) return;
      this.form.patchValue({
        companyId: profile.companyRegistrationId ?? '',
        phone: typedPhone(profile.phone, this.phoneInput),
      });
    });

    effect(() => {
      const rows = this.saved.value();
      if (!rows) return;

      const address = rows.find((row) => row.id === this.addressId);
      if (!address) {
        this.notFound.set(true);
        return;
      }
      this.fill(address);
    });

    usePageSeo({
      name: () => (this.isNew ? this.text.newHeading : this.text.editHeading),
    });
  }

  private fill(address: Address): void {
    this.form.reset({
      label: address.label ?? '',
      companyName: address.companyName ?? '',
      companyId: address.companyId ?? '',
      street: address.street,
      street2: address.street2 ?? '',
      postalCode: address.postalCode,
      city: address.city,
      region: address.region ?? '',
      country: address.country,
      phone: typedPhone(address.phone, this.phoneInput),
    });
  }

  /**
   * A picked suggestion, spread across the form. Only the parts the provider
   * actually answered are written — a partial answer must not blank what the
   * customer already typed — and the street line is composed the way it is
   * printed, house number included.
   */
  protected fillFrom(components: AddressComponents): void {
    const street = [components.street, components.house]
      .filter(Boolean)
      .join(' ');
    this.form.patchValue({
      ...(street ? { street } : {}),
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

  /** The three refusals the form has to explain rather than throw. */
  private refusal(
    code: Extract<SaveAddressResult, { ok: false }>['code'],
  ): string {
    if (code === 'address-limit-reached') return this.text.limitReached;
    if (code === 'invalid-company-id') return this.validation.companyIdFormat;
    return this.text.unsupportedCountry;
  }

  protected submitting(): boolean {
    return this.status() === 'submitting';
  }

  protected isInvalid(control: keyof typeof this.form.controls): boolean {
    return this.fieldErrors.show(this.form.controls[control]);
  }

  protected async submit(): Promise<void> {
    this.fieldErrors.markSubmitted();
    if (this.form.invalid) return;

    this.status.set('submitting');
    this.error.set(null);
    const value = this.form.getRawValue();
    // Empty means absent, not an empty string: the columns are nullable and an
    // address with a blank company name is one without a company.
    const optional = (raw: string) => raw.trim() || null;
    const input: AddressInput = {
      label: optional(value.label),
      companyName: optional(value.companyName),
      companyId: optional(value.companyId),
      street: value.street.trim(),
      street2: optional(value.street2),
      postalCode: value.postalCode.trim(),
      city: value.city.trim(),
      region: optional(value.region),
      country: value.country,
      phone: canonicalPhone(value.phone, this.phoneInput) || null,
    };

    try {
      const result = this.addressId
        ? await this.addresses.update(this.addressId, input)
        : await this.addresses.create(input);

      if (!result.ok) {
        this.status.set('idle');
        this.error.set(this.refusal(result.code));
        return;
      }
      // Back to the book, which shows what was saved — better than a notice
      // about it.
      await this.router.navigateByUrl('/account');
    } catch {
      this.status.set('idle');
      this.error.set(this.text.saveError);
    }
  }
}
