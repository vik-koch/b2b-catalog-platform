import { Component, effect, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Address, fillText } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { usePageSeo } from '../../shared/core/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { AddressFields } from '../../shared/addresses/address-fields';
import { createAddressForm } from '../../shared/addresses/address-form';
import {
  AddressesService,
  SaveAddressResult,
} from '../../shared/addresses/addresses.service';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

type Status = 'idle' | 'submitting' | 'error';

/**
 * Adding or correcting one saved address (FR-CART-04). One screen for both,
 * like the admin editors: `/account/addresses/new` and
 * `/account/addresses/:id/edit`.
 *
 * The fields themselves are the ones checkout draws (AddressFields); what this
 * page owns is where the row comes from, what a refusal means, and where it
 * goes afterwards.
 */
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
      <h1 appPageTitle class="mb-2">
        {{ isNew ? text.newHeading : text.editHeading }}
      </h1>
      <p appPageIntro class="mb-4">{{ text.intro }}</p>

      @if (ready()) {
        <form [formRoot]="form.field" class="space-y-6">
          <app-address-fields [form]="form" />

          <div class="flex flex-wrap items-center gap-3">
            <button appButton type="submit" [disabled]="submitting()">
              {{ submitting() ? actionText.saving : text.submit }}
            </button>
            <a appButton variant="secondary" routerLink="/account">
              {{ actionText.cancel }}
            </a>
          </div>

          @if (error()) {
            <p appErrorText role="alert">{{ error() }}</p>
          }
        </form>
      } @else if (notFound()) {
        <p appErrorText role="alert">{{ text.error }}</p>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="6" />
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

  protected readonly status = signal<Status>('idle');
  protected readonly error = signal<string | null>(null);
  protected readonly notFound = signal(false);

  protected readonly form = createAddressForm({ action: () => this.save() });

  /**
   * The row being corrected. There is no read-one endpoint — the book is a
   * short list the account already has — so an edit reads the list and finds
   * itself in it, and a new address asks for nothing.
   */
  private readonly saved = resource({
    params: () => this.addressId ?? undefined,
    loader: () => this.addresses.list(),
  });
  protected readonly showSkeleton = delayedLoading(this.saved.isLoading);
  protected readonly ready = () =>
    (this.isNew || this.saved.hasValue()) && !this.notFound();

  constructor() {
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
    this.form.fill(address);
  }

  /** The refusals the form has to explain rather than throw. */
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

  /** The postcode's own rule, in the customer's words and with the example
   * the deployment configured — the API answers with a code alone. */
  private postalCodeMessage(): string {
    const rule = this.form.postalCodeRule();
    return rule
      ? fillText(this.fieldText.postalCodeFormat, { example: rule.example })
      : this.fieldText.required;
  }

  protected submitting(): boolean {
    return this.status() === 'submitting';
  }

  private async save(): Promise<void> {
    this.status.set('submitting');
    this.error.set(null);
    const input = this.form.value();

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
