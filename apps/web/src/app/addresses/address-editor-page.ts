import { Component, effect, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Address } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { FieldErrors } from '../core/form-errors';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { AddressFields } from './address-fields';
import { createAddressForm } from './address-form';
import { AddressesService, SaveAddressResult } from './addresses.service';

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
  imports: [RouterLink, AddressFields, Button, Skeleton],
  template: `
    <div class="max-w-xl">
      <h1 class="mb-2 text-3xl font-bold tracking-tight">
        {{ isNew ? text.newHeading : text.editHeading }}
      </h1>
      <p class="mb-8 text-muted">{{ text.intro }}</p>

      @if (ready()) {
        <!-- The native submit rather than Angular's: the form group lives
             inside AddressFields, so no FormGroupDirective is attached here to
             emit ngSubmit. -->
        <form class="space-y-6" novalidate (submit)="submit($event)">
          <app-address-fields [form]="form" [fieldErrors]="fieldErrors" />

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
  private readonly addresses = inject(AddressesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly text = inject(APP_TEXT).auth.myAccount.addresses;

  private readonly addressId = this.route.snapshot.paramMap.get('id');
  protected readonly isNew = this.addressId === null;

  protected readonly status = signal<Status>('idle');
  protected readonly error = signal<string | null>(null);
  protected readonly notFound = signal(false);

  protected readonly form = createAddressForm();
  protected readonly fieldErrors = new FieldErrors(this.form.group);

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

  /** The two refusals the form has to explain rather than throw. */
  private refusal(
    code: Extract<SaveAddressResult, { ok: false }>['code'],
  ): string {
    return code === 'address-limit-reached'
      ? this.text.limitReached
      : this.text.unsupportedCountry;
  }

  protected submitting(): boolean {
    return this.status() === 'submitting';
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.fieldErrors.markSubmitted();
    if (this.form.group.invalid) return;

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
