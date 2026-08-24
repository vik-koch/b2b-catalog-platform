import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Address } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { SignedInAs } from '../auth/signed-in-as';
import { formatPhone } from '../core/contact-fields';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { Icon } from '../ui/icons/icon';
import { Skeleton } from '../ui/skeleton';
import { AddressesService } from '../addresses/addresses.service';
import {
  addressDetailLines,
  addressDisplayName,
} from '../addresses/address-format';
import { ConfirmService } from '../ui/confirm.service';
import { AccountService } from './account.service';

/** One line of the details list. */
interface DetailRow {
  readonly label: string;
  readonly value: string;
}

/**
 * The customer's own area, in the same section-per-topic shape as the admin
 * panel: greeting, then what is on the account. Addresses and order history
 * become sections here rather than pages of their own.
 *
 * Details are read-only for now. Nothing here is editable by its owner yet —
 * the fields staff approved the account on are evidence for a decision, so the
 * page says who to ask rather than pretending they are fixed forever.
 */
@Component({
  selector: 'app-account-page',
  imports: [SignedInAs, Skeleton, Button, RouterLink, Icon],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">{{ text.account }}</h1>
    <app-signed-in-as />

    <!-- Section headings carry a muted glyph for the topic, as the admin panel's
         do — one per card, at this level only. -->
    <section class="mt-10">
      <h2
        class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
        <app-icon name="user" class="h-4 w-4" />
        {{ accountText.detailsHeading }}
      </h2>
      <div class="rounded-lg border border-border p-5">
        @if (profile.hasValue()) {
          <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-[12rem_1fr]">
            @for (row of rows(); track row.label) {
              <dt class="text-sm text-muted">{{ row.label }}</dt>
              <dd class="text-sm">{{ row.value }}</dd>
            }
          </dl>
          <p class="mt-5 text-sm text-subtle">{{ accountText.changeHint }}</p>
          <a
            appButton
            variant="secondary"
            routerLink="/account/edit"
            class="mt-5"
          >
            {{ accountText.edit.action }}
          </a>
        } @else if (profile.error()) {
          <p class="text-sm text-red-600" role="alert">
            {{ accountText.error }}
          </p>
        } @else if (showSkeleton()) {
          <app-skeleton [lines]="4" />
        }
      </div>
    </section>

    <!-- The address book (FR-CART-04). A section here rather than a page of its
         own: it is one short list, and checkout is where it is actually used —
         this is where it is kept. -->
    <section class="mt-10">
      <h2
        class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
        <app-icon name="store" class="h-4 w-4" />
        {{ addressText.heading }}
      </h2>
      <div class="rounded-lg border border-border p-5">
        @if (addresses.hasValue()) {
          @if (addresses.value().length === 0) {
            <p class="text-sm text-muted">{{ addressText.empty }}</p>
          } @else {
            <ul class="divide-y divide-border">
              @for (address of addresses.value(); track address.id) {
                <li
                  class="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0"
                >
                  <div>
                    <p class="text-sm font-semibold">{{ name(address) }}</p>
                    @if (lines(address)) {
                      <p class="mt-1 text-sm text-muted">
                        {{ lines(address) }}
                      </p>
                    }
                  </div>
                  <div class="flex shrink-0 gap-2">
                    <a
                      appButton
                      variant="secondary"
                      [routerLink]="['/account/addresses', address.id, 'edit']"
                    >
                      {{ addressText.edit }}
                    </a>
                    <button
                      appButton
                      variant="dangerOutline"
                      type="button"
                      (click)="remove(address)"
                    >
                      {{ addressText.remove }}
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
          <a
            appButton
            variant="secondary"
            routerLink="/account/addresses/new"
            class="mt-5"
          >
            {{ addressText.add }}
          </a>
        } @else if (addresses.error()) {
          <p class="text-sm text-red-600" role="alert">
            {{ addressText.error }}
          </p>
        } @else if (showAddressSkeleton()) {
          <app-skeleton [lines]="3" />
        }
      </div>
    </section>

    <!-- Everything you can do to the account itself, in one card: two rows, not
         two cards holding one button each. Deleting stays the last row and
         keeps its own heading — it is a different weight of decision, and the
         divider is what says so. Its consequences still live on their own page
         rather than being crammed in beside the link. -->
    <section class="mt-10">
      <h2
        class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
        <app-icon name="lock" class="h-4 w-4" />
        {{ text.securityHeading }}
      </h2>
      <div class="divide-y divide-border rounded-lg border border-border">
        <div class="p-5">
          <a appButton variant="secondary" routerLink="/change-password">
            {{ text.changePassword.heading }}
          </a>
        </div>

        <div class="p-5">
          <h3 class="mb-2 text-sm font-semibold">{{ deleteText.heading }}</h3>
          <p class="mb-4 text-sm text-muted">{{ deleteText.intro }}</p>
          <!-- Outlined, not solid: this only opens the page that explains what
               would be lost. The solid red belongs to the click that confirms. -->
          <a appButton variant="dangerOutline" routerLink="/account/delete">
            {{ deleteText.action }}
          </a>
        </div>
      </div>
    </section>
  `,
})
export class AccountPage {
  private readonly account = inject(AccountService);
  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;

  private readonly addressBook = inject(AddressesService);
  private readonly confirm = inject(ConfirmService);
  private readonly addressConfig = inject(DEPLOYMENT_CONFIG).address;

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly accountText = inject(APP_TEXT).auth.myAccount;
  protected readonly deleteText = inject(APP_TEXT).auth.myAccount.delete;
  protected readonly addressText = inject(APP_TEXT).auth.myAccount.addresses;

  protected readonly profile = resource({
    loader: () => this.account.getProfile(),
  });
  protected readonly showSkeleton = delayedLoading(this.profile.isLoading);

  protected readonly addresses = resource({
    loader: () => this.addressBook.list(),
  });
  protected readonly showAddressSkeleton = delayedLoading(
    this.addresses.isLoading,
  );

  /** Its label, or where it is when it was never given one. */
  protected name(address: Address): string {
    return addressDisplayName(address);
  }

  /** The rest of it, comma-separated: the card is a list of addresses, not a
   * letter. */
  protected lines(address: Address): string {
    return addressDetailLines(address, this.addressConfig).join(', ');
  }

  /**
   * Removing one. Confirmed first — it is the only destructive thing on this
   * card — and the list is refreshed rather than spliced, so what is on screen
   * is what the server has.
   */
  protected async remove(address: Address): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: this.addressText.removeHeading,
      message: this.addressText.removeConfirm.replace(
        '{label}',
        this.name(address),
      ),
      confirmLabel: this.addressText.remove,
      cancelLabel: this.text.myAccount.edit.cancel,
    });
    if (!confirmed) return;

    await this.addressBook.remove(address.id);
    this.addresses.reload();
  }

  /**
   * Only the lines this account actually has. A staff account has no phone, a
   * private person no registration number — and an empty dash against every
   * second label reads as something missing rather than something absent.
   */
  protected readonly rows = computed<DetailRow[]>(() => {
    const profile = this.profile.value();
    if (!profile) return [];

    const t = this.accountText;
    const name = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    const type =
      profile.customerType === 'company'
        ? t.company
        : profile.customerType === 'person'
          ? t.person
          : null;

    return [
      { label: t.name, value: name },
      { label: t.email, value: profile.email },
      // Stored as bare digits; read back with the deployment's own grouping.
      { label: t.phone, value: formatPhone(profile.phone, this.phoneInput) },
      { label: t.customerType, value: type ?? '' },
      { label: t.companyId, value: profile.companyRegistrationId ?? '' },
      { label: t.companyName, value: profile.companyName ?? '' },
      { label: t.memberSince, value: this.formatDate(profile.createdAt) },
    ].filter((row) => row.value !== '');
  });

  private formatDate(iso: string): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'long' }).format(
      new Date(iso),
    );
  }

  constructor() {
    usePageSeo({ name: () => this.text.account });
  }
}
