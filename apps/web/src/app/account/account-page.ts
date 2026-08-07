import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { SignedInAs } from '../auth/signed-in-as';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
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
  imports: [SignedInAs, Skeleton, Button, RouterLink],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">{{ text.account }}</h1>
    <app-signed-in-as />

    <section class="mt-10">
      <h2
        class="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
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

    <section class="mt-10">
      <h2
        class="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
        {{ text.securityHeading }}
      </h2>
      <div class="rounded-lg border border-border p-5">
        <a appButton variant="secondary" routerLink="/change-password">
          {{ text.changePassword.heading }}
        </a>
      </div>
    </section>

    <!-- Last, and quiet: leaving is a real thing to be able to do, but it is
         nobody's reason for coming here. The consequences live on its own
         page rather than being crammed in beside the link. -->
    <section class="mt-10">
      <h2
        class="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
        {{ deleteText.heading }}
      </h2>
      <div class="rounded-lg border border-border p-5">
        <p class="mb-4 text-sm text-muted">{{ deleteText.intro }}</p>
        <a appButton variant="secondary" routerLink="/account/delete">
          {{ deleteText.action }}
        </a>
      </div>
    </section>
  `,
})
export class AccountPage {
  private readonly account = inject(AccountService);
  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly accountText = inject(APP_TEXT).auth.myAccount;
  protected readonly deleteText = inject(APP_TEXT).auth.myAccount.delete;

  protected readonly profile = resource({
    loader: () => this.account.getProfile(),
  });
  protected readonly showSkeleton = delayedLoading(this.profile.isLoading);

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
      { label: t.phone, value: profile.phone ?? '' },
      { label: t.customerType, value: type ?? '' },
      { label: t.companyId, value: profile.companyRegistrationId ?? '' },
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
