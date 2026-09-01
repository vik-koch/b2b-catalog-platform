import { Component, computed, inject, resource, Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Address, fillText } from '@b2b-catalog-platform/shared';
import {
  addressDetailLines,
  addressDisplayName,
} from '../addresses/address-format';
import { AddressesService } from '../addresses/addresses.service';
import { SignedInAs } from '../auth/signed-in-as';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { formatPhone } from '../core/contact-fields';
import { usePageSeo } from '../core/page-seo';
import { OrderRows } from '../orders/order-rows';
import { OrdersService } from '../orders/orders.service';
import { Button } from '../ui/button';
import { ConfirmService } from '../ui/confirm.service';
import { IconButton } from '../ui/icon-button';
import { Icon } from '../ui/icons/icon';
import { Skeleton } from '../ui/skeleton';
import { AccountService } from './account.service';

/**
 * How many of the newest orders the account page itself shows. Enough that a
 * customer who came to look up what they sent last week finds it here, few
 * enough that the card stays a card — the rest is what the history page is
 * for.
 */
const RECENT_ORDERS = 5;

/**
 * Whether a resource has an answer of any kind. `isLoading` alone is false
 * before a resource has started, which would count an untouched one as ready.
 */
function settled(resource: {
  isLoading: Signal<boolean>;
  status: Signal<string>;
}): boolean {
  return !resource.isLoading() && resource.status() !== 'idle';
}

/** One line of the details list. */
interface DetailRow {
  readonly label: string;
  readonly value: string;
}

/**
 * The customer's own area, in the same section-per-topic shape as the admin
 * panel: greeting, then what is on the account. The address book is a section
 * here rather than a page of its own, and so are the newest orders — the full
 * history keeps its page, because it is paged and grows for years.
 *
 * Details are read-only for now. Nothing here is editable by its owner yet —
 * the fields staff approved the account on are evidence for a decision, so the
 * page says who to ask rather than pretending they are fixed forever.
 */
@Component({
  selector: 'app-account-page',
  imports: [
    SignedInAs,
    Skeleton,
    Button,
    IconButton,
    OrderRows,
    RouterLink,
    Icon,
  ],
  template: `
    <h1 class="mb-4 text-3xl font-medium tracking-tight">{{ text.account }}</h1>
    <app-signed-in-as />

    <!-- Section headings carry a muted glyph for the topic, as the admin
         panel's do — one per card, at this level only.

         The details and the address book in one card, two tracks wide, as the
         admin panel lays its own groups out: they are the two halves of "who
         you are to us", and a card each left two short lists stacked down a
         page that had room for them side by side. Stacked again below md,
         where a column of address rows and their buttons is too narrow to
         read; the divider turns with them, and the taller column is what sets
         the card's height — a long address book leaves space under "edit
         details" rather than squeezing the list beside it. Two thirds to the
         details and one to the book: the details are a label-and-value table
         and want the width, an address is short lines and a pair of glyphs. -->
    <section class="mt-10">
      <h2
        class="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase"
      >
        <app-icon name="user" class="h-4 w-4" />
        {{ accountText.profileHeading }}
      </h2>
      <!-- The card is drawn straight away, headings and all, with grey bars
           where the values will be. Nothing here waits for a delay first: the
           shape of this card is known before the calls answer, so the bars
           stand in the box the values will fill and the arrival is a fill
           rather than a jump. The delayed skeleton is for regions whose height
           nobody can guess. -->
      <div class="rounded-lg border border-border">
        <div
          class="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0"
        >
          <div class="p-5">
            <h3 class="mb-3 text-sm font-medium">
              {{ accountText.detailsHeading }}
            </h3>
            <!-- Both halves at once, never each as it lands. They are two
                 answers to one question arriving on two round trips, and drawn
                 separately the card grew twice under somebody already reading
                 the first half of it. Settled, not loaded — a column that
                 failed says so in the same frame the other one appears in. -->
            @if (!profileReady()) {
              <!-- Five rows: what a private account has. A company's two extra
                   lines grow the card by that much on arrival, which is the
                   smaller error of the two — bars for rows that never come
                   would shrink it instead. -->
              <app-skeleton [lines]="5" />
            } @else if (profile.hasValue()) {
              <dl class="grid gap-x-8 sm:grid-cols-[10rem_1fr]">
                @for (row of rows(); track row.label) {
                  <dt
                    class="text-sm text-muted odd:mb-1 sm:odd:mb-3 nth-last-[2]:mb-0"
                  >
                    {{ row.label }}
                  </dt>
                  <dd class="text-sm even:mb-3 sm:even:mb-3 last:mb-0">
                    {{ row.value }}
                  </dd>
                }
              </dl>
              <p class="mt-5 text-sm text-subtle">
                {{ accountText.changeHint }}
              </p>
              <a
                appButton
                variant="secondary"
                routerLink="/account/edit"
                class="mt-5"
              >
                {{ accountText.edit.action }}
              </a>
            } @else {
              <p class="text-sm text-red-600" role="alert">
                {{ accountText.error }}
              </p>
            }
          </div>

          <!-- The address book (FR-CART-04). Here rather than on a page of
               its own: it is one short list, and checkout is where it is
               actually used — this is where it is kept. -->
          <div class="p-5">
            <h3 class="mb-3 text-sm font-medium">
              {{ addressText.heading }}
            </h3>
            @if (!profileReady()) {
              <app-skeleton [lines]="3" />
            } @else if (addresses.hasValue()) {
              @if (addresses.value().length === 0) {
                <p class="text-sm text-muted">{{ addressText.empty }}</p>
              } @else {
                <ul class="divide-y divide-border">
                  @for (address of addresses.value(); track address.id) {
                    <!-- The buttons sit against the middle of the row they
                         act on, not against its first line: an address is one
                         or two lines deep, and a pair of buttons pinned to the
                         top of a two-line row reads as belonging to the name
                         alone. The last row gives up its bottom padding so
                         "add address" stands the same distance under the list
                         as "edit details" does under its own last line — the
                         two columns end level. -->
                    <li
                      class="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p class="text-sm font-medium">
                          {{ name(address) }}
                        </p>
                        @if (lines(address)) {
                          <p class="mt-1 text-sm text-muted">
                            {{ lines(address) }}
                          </p>
                        }
                      </div>
                      <!-- Glyphs, not words: the row already says which
                           address they act on, and two spelled-out buttons
                           on every line read louder than the addresses. The
                           bare glyph is the storefront's own icon control,
                           as the cart's bin is — the disc belongs to
                           affordances laid over content. The address is the
                           accessible name. -->
                      <div class="flex shrink-0 gap-1">
                        <a
                          appIconButton
                          shape="plain"
                          [attr.aria-label]="editLabel(address)"
                          [routerLink]="[
                            '/account/addresses',
                            address.id,
                            'edit',
                          ]"
                        >
                          <app-icon name="pencil" class="h-4 w-4" />
                        </a>
                        <button
                          appIconButton
                          shape="plain"
                          variant="danger"
                          type="button"
                          [attr.aria-label]="removeLabel(address)"
                          (click)="remove(address)"
                        >
                          <app-icon name="trash-2" class="h-4 w-4" />
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
            } @else {
              <p class="text-sm text-red-600" role="alert">
                {{ addressText.error }}
              </p>
            }
          </div>
        </div>
      </div>
    </section>

    <!-- Order history (FR-ACC-01). The newest few, not a link to them: an
         order history is paged and grows for years, but what somebody comes
         here for is the one they sent last week — and it was a click away
         behind a button that only said the list existed. The page itself is
         still there for the rest of it. -->
    <section class="mt-10">
      <h2
        class="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase"
      >
        <app-icon name="shopping-basket" class="h-4 w-4" />
        {{ orderText.heading }}
      </h2>
      <!-- As above: the frame and its bars from the first frame. -->
      <div class="rounded-lg border border-border p-5">
        @if (!ordersReady()) {
          <app-skeleton [lines]="3" />
        } @else if (recentOrders(); as recent) {
          @if (recent.length === 0) {
            <p class="text-sm text-muted">{{ orderText.empty }}</p>
            <a appButton variant="secondary" routerLink="/catalog" class="mt-5">
              {{ orderText.emptyAction }}
            </a>
          } @else {
            <app-order-rows [orders]="recent" />
            <!-- Only where there is more than what is on screen: a button that
                 opens the same five rows on another page is a click that
                 changes nothing. -->
            @if (hasMoreOrders()) {
              <a
                appButton
                variant="secondary"
                routerLink="/account/orders"
                class="mt-5"
              >
                {{ orderText.action }}
              </a>
            }
          }
        } @else {
          <p class="text-sm text-red-600" role="alert">
            {{ orderText.error }}
          </p>
        }
      </div>
    </section>

    <!-- Everything you can do to the account itself, in one card and two
         tracks. Deleting keeps its own column and its own heading — it is a
         different weight of decision — and its consequences still live on
         their own page rather than being crammed in beside the link. -->
    <section class="mt-10">
      <h2
        class="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase"
      >
        <app-icon name="lock" class="h-4 w-4" />
        {{ text.securityHeading }}
      </h2>
      <div class="rounded-lg border border-border">
        <div
          class="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0"
        >
          <div class="flex flex-col p-5">
            <h3 class="mb-2 text-sm font-medium">
              {{ text.changePassword.heading }}
            </h3>
            <p class="mb-4 text-sm text-muted">
              {{ text.changePassword.intro }}
            </p>
            <!-- Pinned to the bottom of its own column, so the two buttons sit
                 on one line however long the sentences above them run. -->
            <a
              appButton
              variant="secondary"
              routerLink="/change-password"
              class="mt-auto self-start"
            >
              {{ text.changePassword.heading }}
            </a>
          </div>

          <div class="flex flex-col p-5">
            <h3 class="mb-2 text-sm font-medium">{{ deleteText.heading }}</h3>
            <p class="mb-4 text-sm text-muted">{{ deleteText.intro }}</p>
            <!-- Outlined, not solid: this only opens the page that explains what
                 would be lost. The solid red belongs to the click that confirms. -->
            <a
              appButton
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
  `,
})
export class AccountPage {
  private readonly account = inject(AccountService);
  private readonly api = inject(OrdersService);
  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;

  private readonly addressBook = inject(AddressesService);
  private readonly confirm = inject(ConfirmService);
  private readonly addressConfig = inject(DEPLOYMENT_CONFIG).address;

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly accountText = inject(APP_TEXT).auth.myAccount;
  protected readonly deleteText = inject(APP_TEXT).auth.myAccount.delete;
  protected readonly addressText = inject(APP_TEXT).auth.myAccount.addresses;
  protected readonly orderText = inject(APP_TEXT).orders;

  protected readonly profile = resource({
    loader: () => this.account.getProfile(),
  });

  protected readonly addresses = resource({
    loader: () => this.addressBook.list(),
  });

  /**
   * Whether the first card has both its answers — either one, since a refusal
   * is an answer the card can draw. The two halves are one card and must
   * arrive as one; separately, the card grows a second time under a reader who
   * has already started on the first half.
   */
  protected readonly profileReady = computed(
    () => settled(this.profile) && settled(this.addresses),
  );

  /**
   * The order history's own first page, of which this card shows the newest
   * few. Deliberately the same call the list page makes rather than an
   * endpoint of its own: the count on the answer is also how this card knows
   * whether there is anything more to send anybody to.
   */
  protected readonly orders = resource({
    loader: () => this.api.listMine(1),
  });
  /** Whether the history card has an answer of any kind to draw. */
  protected readonly ordersReady = computed(() => settled(this.orders));

  /** Null while loading or failed — `value()` throws on an errored resource. */
  protected readonly recentOrders = computed(() =>
    this.orders.hasValue()
      ? this.orders.value().items.slice(0, RECENT_ORDERS)
      : null,
  );

  /** Whether the history holds more than this card is showing. */
  protected readonly hasMoreOrders = computed(
    () =>
      this.orders.hasValue() &&
      this.orders.value().pagination.total > RECENT_ORDERS,
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

  /** The name the icon-only buttons carry, since the row's own text is not
   * their label. */
  protected editLabel(address: Address): string {
    return fillText(this.addressText.editLabel, { label: this.name(address) });
  }

  protected removeLabel(address: Address): string {
    return fillText(this.addressText.removeLabel, {
      label: this.name(address),
    });
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
