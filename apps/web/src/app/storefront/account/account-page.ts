import { Component, computed, inject, resource, Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Address,
  fillText,
  formatPersonName,
} from '@b2b-catalog-platform/shared';
import {
  addressDetailLines,
  addressDisplayName,
} from '../../shared/addresses/address-format';
import { AddressesService } from '../../shared/addresses/addresses.service';
import { SignedInAs } from '../../shared/auth/signed-in-as';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { formatPhone } from '../../shared/core/contact-fields';
import { usePageSeo } from '../../shared/core/page-seo';
import { OrderRows } from '../orders/order-rows';
import { OrdersService } from '../orders/orders.service';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import {
  confirmRequest,
  ConfirmService,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { ActionLink } from '@b2b-catalog-platform/ui/actions/action-link';
import { WorkService } from '../../shared/work/work.service';
import { AccountService } from './account.service';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { lockIcon } from '@b2b-catalog-platform/ui/icons/glyphs/lock';
import { mapPinIcon } from '@b2b-catalog-platform/ui/icons/glyphs/map-pin';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { userIcon } from '@b2b-catalog-platform/ui/icons/glyphs/user';
import { Card } from '@b2b-catalog-platform/ui/content/card';

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
    Card,
    SignedInAs,
    Skeleton,
    Button,
    IconButton,
    OrderRows,
    RouterLink,
    Icon,
    ActionLink,
    PageTitle,
    ErrorText,
  ],
  template: `
    <!-- Narrower than the shell allows, as the admin panel is: this is a
         column of short cards, and at the full width of a desktop each one
         was a heading and half a screen of nothing beside it. -->
    <div class="max-w-3xl">
      <h1 uiPageTitle class="mb-4">
        {{ text.account }}
      </h1>
      <app-signed-in-as />

      <!-- One stack with one gap, rather than a margin repeated on every
           section: the space between two cards is a property of the list
           they are in, not of each card. -->
      <div class="mt-7 flex flex-col gap-7">
        <!-- Order history (FR-ACC-01). The newest few, not a link to them: an
             order history is paged and grows for years, but what somebody comes
             here for is the one they sent last week — and it was a click away
             behind a button that only said the list existed. The page itself is
             still there for the rest of it. -->
        <section>
          <h2 [class]="headingClass">
            <ui-icon [glyph]="shoppingBasketIcon" class="size-4" />
            {{ orderText.heading }}
          </h2>
          <!-- As above: the frame and its bars from the first frame. -->
          <div uiCard>
            <!-- What waits on the account holder, above the rows it is about
                 (FR-WORK-03): the same amber line the marker on the account
                 control leads here for, and the link opens the history it is
                 about. Money due from them, and an order packed for them to
                 collect — silent when neither is true. -->
            @if (waitingPayments() || waitingPickups()) {
              <!-- Stacked, as the admin panel's two order notes are: money owed
                   and a parcel on the counter are two jobs with two lists. -->
              <div class="mb-4 flex flex-col gap-1">
                @if (waitingPayments(); as count) {
                  <a
                    uiActionLink
                    routerLink="/account/orders"
                    [queryParams]="{ state: 'to-pay' }"
                    >{{ fill(orderText.awaitingPayment, count) }}</a
                  >
                }
                @if (waitingPickups(); as count) {
                  <a
                    uiActionLink
                    routerLink="/account/orders"
                    [queryParams]="{ state: 'to-collect' }"
                    >{{ fill(orderText.awaitingPickup, count) }}</a
                  >
                }
              </div>
            }
            @if (!ordersReady()) {
              <ui-skeleton [lines]="3" />
            } @else if (recentOrders(); as recent) {
              @if (recent.length === 0) {
                <p class="text-sm text-ink-subtle">{{ orderText.empty }}</p>
                <a
                  uiButton
                  variant="secondary"
                  routerLink="/catalog"
                  class="mt-5"
                >
                  {{ orderText.emptyAction }}
                </a>
              } @else {
                <app-order-rows [orders]="recent" />
                <!-- Only where there is more than what is on screen: a button that
                     opens the same five rows on another page is a click that
                     changes nothing. -->
                @if (hasMoreOrders()) {
                  <a
                    uiButton
                    variant="secondary"
                    routerLink="/account/orders"
                    class="mt-5"
                  >
                    {{ orderText.action }}
                  </a>
                }
              }
            } @else {
              <p uiErrorText role="alert">
                {{ orderText.error }}
              </p>
            }
          </div>
        </section>

        <!-- Section headings carry a muted glyph for the topic, as the admin
             panel's do.

             The details and the address book are two sections, one under the
             other, rather than two tracks of one card. Side by side, each was a
             column of a page's width divided in half — a label-and-value table
             squeezed into one and a list of addresses and their buttons into the
             other — and each needed a heading of its own inside the card to say
             which was which. Down the page they have the width to be read, and
             the section heading is that heading. -->
        <section>
          <h2 [class]="headingClass">
            <ui-icon [glyph]="userIcon" class="size-4" />
            {{ accountText.detailsHeading }}
          </h2>
          <!-- The card is drawn straight away with grey bars where the values
               will be. Nothing here waits for a delay first: the shape of this
               card is known before the calls answer, so the bars stand in the box
               the values will fill and the arrival is a fill rather than a jump.
               The delayed skeleton is for regions whose height nobody can guess. -->
          <div uiCard>
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
              <ui-skeleton [lines]="5" />
            } @else if (profile.hasValue()) {
              <dl class="grid gap-x-8 sm:grid-cols-[12rem_1fr]">
                @for (row of rows(); track row.label) {
                  <dt
                    class="text-sm text-ink-subtle
                           odd:mb-1
                           sm:odd:mb-3
                           nth-last-[2]:mb-0"
                  >
                    {{ row.label }}
                  </dt>
                  <dd class="text-sm even:mb-3 sm:even:mb-3 last:mb-0">
                    {{ row.value }}
                  </dd>
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

        <!-- The address book (FR-CART-04). A section here rather than a page of
             its own: it is one short list, and checkout is where it is actually
             used — this is where it is kept. -->
        <section>
          <h2 [class]="headingClass">
            <ui-icon [glyph]="mapPinIcon" class="size-4" />
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
                    <!-- The buttons sit against the middle of the row they
                           act on, not against its first line: an address is one
                           or two lines deep, and a pair of buttons pinned to the
                           top of a two-line row reads as belonging to the name
                           alone. The last row gives up its bottom padding so
                           "add address" stands the same distance under the list
                           as "edit details" does under its own last line. -->
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
                      <!-- Glyphs, not words: the row already says which
                             address they act on, and two spelled-out buttons
                             on every line read louder than the addresses. The
                             bare glyph is the storefront's own icon control,
                             as the cart's bin is — the disc belongs to
                             affordances laid over content. The address is the
                             accessible name. -->
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

        <!-- Everything you can do to the account itself, in one card and two
             tracks. Deleting keeps its own column and its own heading — it is a
             different weight of decision — and its consequences still live on
             their own page rather than being crammed in beside the link. -->
        <section>
          <h2 [class]="headingClass">
            <ui-icon [glyph]="lockIcon" class="size-4" />
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
                <!-- Pinned to the bottom of its own column, so the two buttons sit
                     on one line however long the sentences above them run. -->
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
                <!-- Outlined, not solid: this only opens the page that explains what
                     would be lost. The solid red belongs to the click that confirms. -->
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
  protected readonly shoppingBasketIcon = shoppingBasketIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly userIcon = userIcon;
  /** One heading treatment, written once: four sections spelling the same
   * class list out is four chances for one of them to drift. */
  protected readonly headingClass = `mb-1.5 flex items-center gap-2 text-xs
                                     font-medium tracking-wide text-ink-subtle
                                     uppercase`;

  private readonly account = inject(AccountService);
  private readonly api = inject(OrdersService);
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;

  private readonly addressBook = inject(AddressesService);
  private readonly confirm = inject(ConfirmService);
  private readonly addressConfig = inject(DEPLOYMENT_CONFIG).address;

  protected readonly text = inject(STOREFRONT_TEXT).auth;
  protected readonly accountText = inject(STOREFRONT_TEXT).account;
  private readonly sharedText = inject(SHARED_TEXT);
  protected readonly deleteText = inject(STOREFRONT_TEXT).account.delete;
  protected readonly addressText = inject(STOREFRONT_TEXT).account.addresses;
  protected readonly orderText = inject(STOREFRONT_TEXT).orders;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  private readonly work = inject(WorkService);

  /** `undefined` where nothing is waiting, so a line is drawn only when there
   * is something to say. Two queues rather than one figure: paying an invoice
   * and collecting a parcel are separate jobs, and each note links to the
   * history narrowed to exactly the orders it counted. */
  protected readonly waitingPayments = computed(
    () => this.work.counts().myPayments || undefined,
  );
  protected readonly waitingPickups = computed(
    () => this.work.counts().myPickups || undefined,
  );

  protected fill(template: string, count: number): string {
    return fillText(template, { count });
  }

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
    return fillText(this.addressText.editAria, { label: this.name(address) });
  }

  protected removeLabel(address: Address): string {
    return fillText(this.addressText.removeAria, {
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
      ...confirmRequest(this.addressText.removeConfirm, this.actionText.cancel),
      message: fillText(this.addressText.removeConfirm.message, {
        label: this.name(address),
      }),
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
    const fields = this.sharedText.fields;
    const kinds = this.sharedText.partyKind;
    const name = formatPersonName(profile.firstName, profile.lastName);
    const type =
      profile.customerType === 'company'
        ? kinds.company
        : profile.customerType === 'person'
          ? kinds.person
          : null;

    return [
      { label: fields.name.label, value: name },
      { label: fields.email.label, value: profile.email },
      // Stored as bare digits; read back with the deployment's own grouping.
      {
        label: fields.phone.label,
        value: formatPhone(profile.phone, this.phoneInput),
      },
      { label: t.customerType, value: type ?? '' },
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
