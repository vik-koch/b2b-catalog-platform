import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { delayedLoading } from '../../../platform/delayed-loading';
import { usePageSeo } from '../../../platform/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { AddressFields } from '../../../core/accounts/addresses/address-fields';
import { createAddressForm } from '../../../core/accounts/addresses/address-form';
import {
  AddressesService,
  SaveAddressResult,
} from '../../../core/accounts/addresses/addresses.service';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

/** Adding or correcting one saved address. */
@Component({
  selector: 'app-address-editor-page',
  imports: [
    RouterLink,
    AddressFields,
    FORM_FIELDS,
    Button,
    Skeleton,
    PageTitle,
    ErrorText,
    PageIntro,
  ],
  template: `
    <div class="max-w-xl">
      <h1 uiPageTitle class="mb-2">
        {{ isNew ? text.newHeading : text.editHeading }}
      </h1>
      <p uiPageIntro class="mb-4">{{ text.intro }}</p>

      @if (ready()) {
        <form [formRoot]="form.field" class="space-y-6">
          <app-address-fields [form]="form" />

          <div class="flex flex-wrap items-center gap-3">
            <button
              uiButton
              type="submit"
              [disabled]="form.field().submitting()"
            >
              {{ form.field().submitting() ? actionText.saving : text.submit }}
            </button>
            <a uiButton variant="secondary" routerLink="/account">
              {{ actionText.cancel }}
            </a>
          </div>

          @if (error()) {
            <p uiErrorText role="alert">{{ error() }}</p>
          }
        </form>
      } @else if (notFound()) {
        <p uiErrorText role="alert">{{ text.error }}</p>
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="6" />
      }
    </div>
  `,
})
export class AddressEditorPage {
  private readonly addresses = inject(AddressesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly text = inject(STOREFRONT_TEXT).account.addresses;
  private readonly fieldText = inject(STOREFRONT_TEXT).address;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  private readonly addressId = this.route.snapshot.paramMap.get('id');
  protected readonly isNew = this.addressId === null;

  protected readonly error = signal<string | null>(null);

  protected readonly form = createAddressForm({ action: () => this.save() });

  /** There is no read-one route: an edit finds its row in the short list. */
  private readonly saved = resource({
    params: () => this.addressId ?? undefined,
    loader: () => this.addresses.list(),
  });
  private readonly existing = computed(() =>
    this.saved.hasValue()
      ? this.saved.value().find((row) => row.id === this.addressId)
      : undefined,
  );
  protected readonly showSkeleton = delayedLoading(this.saved.isLoading);
  protected readonly notFound = computed(
    () => this.saved.hasValue() && !this.existing(),
  );
  protected readonly ready = computed(() => this.isNew || !!this.existing());

  constructor() {
    effect(() => {
      const address = this.existing();
      if (address) this.form.fill(address);
    });

    usePageSeo({
      name: () => (this.isNew ? this.text.newHeading : this.text.editHeading),
    });
  }

  private refusal(
    code: Extract<SaveAddressResult, { ok: false }>['code'],
  ): string {
    switch (code) {
      case 'address-limit-reached':
        return this.text.limitReached;
      case 'invalid-postal-code':
        return this.postalCodeMessage();
      case 'unsupported-country':
        return this.text.unsupportedCountry;
    }
  }

  /** The API answers with a code alone; the example is the deployment's. */
  private postalCodeMessage(): string {
    const rule = this.form.postalCodeRule();
    return rule
      ? fillText(this.fieldText.postalCodeFormat, { example: rule.example })
      : this.fieldText.required;
  }

  private async save(): Promise<void> {
    this.error.set(null);
    const input = this.form.value();

    try {
      const result = this.addressId
        ? await this.addresses.update(this.addressId, input)
        : await this.addresses.create(input);

      if (!result.ok) {
        this.error.set(this.refusal(result.code));
        return;
      }
      await this.router.navigateByUrl('/account');
    } catch {
      this.error.set(this.text.saveError);
    }
  }
}
