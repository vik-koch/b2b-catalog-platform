import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import { ACCOUNTS_CONFIG } from '../../../core/accounts/accounts-config';
import { Component, computed, inject, resource, Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import {
  addressDetailLines,
  addressDisplayName,
} from '../../../core/accounts/addresses/address-format';
import { AddressesService } from '../../../core/accounts/addresses/addresses.service';
import { SignedInAs } from '../../../core/accounts/auth/signed-in-as';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { SHARED_ACCOUNTS_TEXT } from '../../../core/accounts/accounts-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { formatPhone } from '../../../platform/contact-fields';
import { usePageSeo } from '../../../platform/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import {
  confirmRequest,
  ConfirmService,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { AccountService } from './account.service';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { lockIcon } from '@b2b-catalog-platform/ui/icons/glyphs/lock';
import { mapPinIcon } from '@b2b-catalog-platform/ui/icons/glyphs/map-pin';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { userIcon } from '@b2b-catalog-platform/ui/icons/glyphs/user';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { FACT_LIST } from '@b2b-catalog-platform/ui/content/fact-list';
import { SectionTitle } from '@b2b-catalog-platform/ui/content/section-title';
import {
  Address,
  formatPersonName,
} from '@b2b-catalog-platform/shared/core/accounts';

/** An answer of any kind, kept while a reload fetches the next one: a removed
 * address must not drop both cards back to skeleton bars. */
function settled(resource: { status: Signal<string> }): boolean {
  const status = resource.status();
  return status !== 'idle' && status !== 'loading';
}

/**
 * The customer's own area, a section per topic. The newest orders are
 * ordering's, so the shell projects them in.
 */
@Component({
  selector: 'app-account-page',
  imports: [
    FACT_LIST,
    SectionTitle,
    Card,
    SignedInAs,
    Skeleton,
    Button,
    IconButton,
    RouterLink,
    Icon,
    PageTitle,
    ErrorText,
  ],
  template: `
    <div class="max-w-3xl">
      <h1 uiPageTitle class="mb-4">
        {{ text.account }}
      </h1>
      <app-signed-in-as />

      <div class="mt-7 flex flex-col gap-7">
        <ng-content />

        <section>
          <h2 uiSectionTitle class="mb-1.5" [glyph]="userIcon">
            {{ accountText.detailsHeading }}
          </h2>
          <div uiCard>
            @if (!profileReady()) {
              <!-- A private account's five rows: growing on arrival beats
                   shrinking. -->
              <ui-skeleton [lines]="5" />
            } @else if (profile.hasValue()) {
              <dl uiFactList class="text-sm">
                @for (row of rows(); track row.label) {
                  <dt uiFactTerm>{{ row.label }}</dt>
                  <dd uiFactValue>{{ row.value }}</dd>
                }
              </dl>
              <p class="mt-2 text-sm text-ink-subtle">
                {{ accountText.changeHint }}
              </p>
              <a
                uiButton
                variant="secondary"
                routerLink="/account/edit"
                class="mt-5"
              >
                {{ accountText.edit.action }}
              </a>
            } @else {
              <p uiErrorText role="alert">
                {{ accountText.error }}
              </p>
            }
          </div>
        </section>

        <section>
          <h2 uiSectionTitle class="mb-1.5" [glyph]="mapPinIcon">
            {{ addressText.heading }}
          </h2>
          <div uiCard>
            @if (!profileReady()) {
              <ui-skeleton [lines]="3" />
            } @else if (addresses.hasValue()) {
              @if (addresses.value().length === 0) {
                <p class="text-sm text-ink-subtle">{{ addressText.empty }}</p>
              } @else {
                <ul class="divide-y divide-edge">
                  @for (address of addresses.value(); track address.id) {
                    <li
                      class="flex flex-wrap items-center justify-between gap-4
                             py-4
                             first:pt-0
                             last:pb-0"
                    >
                      <div>
                        <p class="text-sm font-medium">
                          {{ name(address) }}
                        </p>
                        @if (lines(address)) {
                          <p class="mt-1 text-sm text-ink-subtle">
                            {{ lines(address) }}
                          </p>
                        }
                      </div>
                      <div class="flex shrink-0 gap-1">
                        <a
                          uiIconButton
                          [attr.aria-label]="editLabel(address)"
                          [routerLink]="[
                            '/account/addresses',
                            address.id,
                            'edit',
                          ]"
                        >
                          <ui-icon [glyph]="pencilIcon" />
                        </a>
                        <button
                          uiIconButton
                          variant="danger"
                          type="button"
                          [attr.aria-label]="removeLabel(address)"
                          (click)="remove(address)"
                        >
                          <ui-icon [glyph]="trash2Icon" />
                        </button>
                      </div>
                    </li>
                  }
                </ul>
              }
              <a
                uiButton
                variant="secondary"
                routerLink="/account/addresses/new"
                class="mt-5"
              >
                {{ addressText.add }}
              </a>
            } @else {
              <p uiErrorText role="alert">
                {{ addressText.error }}
              </p>
            }
          </div>
        </section>

        <section>
          <h2 uiSectionTitle class="mb-1.5" [glyph]="lockIcon">
            {{ text.securityHeading }}
          </h2>
          <div uiCard [padded]="false">
            <div
              class="grid divide-y divide-edge
                     md:grid-cols-2 md:divide-x md:divide-y-0"
            >
              <div class="flex flex-col p-5">
                <h3 class="mb-2 text-sm font-medium">
                  {{ text.changePassword.heading }}
                </h3>
                <p class="mb-4 text-sm text-ink-subtle">
                  {{ text.changePassword.intro }}
                </p>
                <a
                  uiButton
                  variant="secondary"
                  routerLink="/change-password"
                  class="mt-auto self-start"
                >
                  {{ text.changePassword.heading }}
                </a>
              </div>

              <div class="flex flex-col p-5">
                <h3 class="mb-2 text-sm font-medium">
                  {{ deleteText.heading }}
                </h3>
                <p class="mb-4 text-sm text-ink-subtle">
                  {{ deleteText.intro }}
                </p>
                <a
                  uiButton
                  variant="dangerOutline"
                  routerLink="/account/delete"
                  class="mt-auto self-start"
                >
                  {{ deleteText.action }}
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
})
export class AccountPage {
  protected readonly lockIcon = lockIcon;
  protected readonly mapPinIcon = mapPinIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly userIcon = userIcon;

  private readonly account = inject(AccountService);
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;

  private readonly addressBook = inject(AddressesService);
  private readonly confirm = inject(ConfirmService);
  private readonly addressConfig = inject(ACCOUNTS_CONFIG).address;

  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).auth;
  protected readonly accountText = inject(STOREFRONT_ACCOUNTS_TEXT).account;
  private readonly sharedText = inject(SHARED_TEXT);
  private readonly partyKind = inject(SHARED_ACCOUNTS_TEXT).partyKind;
  protected readonly deleteText = inject(STOREFRONT_ACCOUNTS_TEXT).account
    .delete;
  protected readonly addressText = inject(STOREFRONT_ACCOUNTS_TEXT).account
    .addresses;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  protected readonly profile = resource({
    loader: () => this.account.getProfile(),
  });

  protected readonly addresses = resource({
    loader: () => this.addressBook.list(),
  });

  /** Both cards draw at once, so neither grows under someone reading the
   * other; a failure counts as an answer. */
  protected readonly profileReady = computed(
    () => settled(this.profile) && settled(this.addresses),
  );

  protected readonly name = addressDisplayName;

  protected lines(address: Address): string {
    return addressDetailLines(address, this.addressConfig).join(', ');
  }

  protected editLabel(address: Address): string {
    return fillText(this.addressText.editAria, { label: this.name(address) });
  }

  protected removeLabel(address: Address): string {
    return fillText(this.addressText.removeAria, {
      label: this.name(address),
    });
  }

  protected async remove(address: Address): Promise<void> {
    const confirmed = await this.confirm.ask({
      ...confirmRequest(this.addressText.removeConfirm, this.actionText.cancel),
      message: fillText(this.addressText.removeConfirm.message, {
        label: this.name(address),
      }),
    });
    if (!confirmed) return;

    await this.addressBook.remove(address.id);
    this.addresses.reload();
  }

  /** Only the rows this account has: a dash reads as missing, not absent. */
  protected readonly rows = computed(() => {
    const profile = this.profile.value();
    if (!profile) return [];

    const t = this.accountText;
    const fields = this.sharedText.fields;
    const name = formatPersonName(profile.firstName, profile.lastName);
    const type = profile.customerType
      ? this.partyKind[profile.customerType]
      : '';

    return [
      { label: fields.name.label, value: name },
      { label: fields.email.label, value: profile.email },
      {
        label: fields.phone.label,
        value: formatPhone(profile.phone, this.phoneInput),
      },
      { label: t.customerType, value: type },
      {
        label: fields.companyId.label,
        value: profile.companyRegistrationId ?? '',
      },
      { label: fields.companyName.label, value: profile.companyName ?? '' },
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
