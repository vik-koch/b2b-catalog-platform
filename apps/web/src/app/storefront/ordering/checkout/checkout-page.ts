import {
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { FulfilmentMethod } from '@b2b-catalog-platform/shared/core/ordering';
import {
  isOrderDateAllowed,
  localToday,
} from '@b2b-catalog-platform/shared/storefront/ordering';
import { AccountService } from '../../accounts/account/account.service';
import { AddressForm } from '../../../core/accounts/addresses/address-form';
import { AddressesService } from '../../../core/accounts/addresses/addresses.service';
import { AuthService } from '../../../shared/auth/auth.service';
import { CartService } from '../cart/cart.service';
import { OrderSummary } from '../../../core/ordering/ui/order-summary';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { usePageSeo } from '../../../shared/core/page-seo';
import { OrderReadBack } from '../../../core/ordering/ui/order-read-back';
import { OrdersService } from '../orders/orders.service';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { HoneypotField } from '@b2b-catalog-platform/ui/fields/honeypot-field';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { EmptyState } from '@b2b-catalog-platform/ui/content/empty-state';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { AddressPicker } from './ui/address-picker';
import { CheckoutDraft, PartyChoice as Party } from './checkout-draft';
import { CheckoutDraftService } from './checkout-draft.service';
import { createCheckoutForms } from './checkout-forms';
import { createCheckoutReadBack } from './checkout-read-back';
import { createCheckoutSubmission } from './checkout-submission';
import { DeliveryZoneHint } from './delivery-zone-hint';
import { FulfilmentChoice } from './ui/fulfilment-choice';
import { GuestDetails } from './ui/guest-details';
import { OrderNote } from './ui/order-note';
import { PartyChoice } from './ui/party-choice';
import { PaymentChoice } from './ui/payment-choice';
import { PickupChoice } from './ui/pickup-choice';
import { PreferredDate } from './ui/preferred-date';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { PrivacyNotice } from '../../site/privacy-notice';
import { TermsNotice } from '../../site/terms-notice';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { circleUserRoundIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-user-round';
import { lockIcon } from '@b2b-catalog-platform/ui/icons/glyphs/lock';
import { phoneIcon } from '@b2b-catalog-platform/ui/icons/glyphs/phone';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';
import {
  AddressInput,
  formatPersonName,
} from '@b2b-catalog-platform/shared/core/accounts';
import { SummaryLayout } from '@b2b-catalog-platform/ui/content/summary-layout';
import { IconNote } from '@b2b-catalog-platform/ui/content/icon-note';

/** The checkout (FR-CART-03/04/07/09): one form, then a read-back and the send.
 * One form rather than a wizard, as every question has a working default. The
 * answers live in the draft, so a trip back to the cart keeps them. */
@Component({
  selector: 'app-checkout-page',
  imports: [
    IconNote,
    SummaryLayout,
    HoneypotField,
    WarningNote,
    AddressPicker,
    Button,
    Checkbox,
    TickLabel,
    DeliveryZoneHint,
    EmptyState,
    FulfilmentChoice,
    OrderNote,
    OrderReadBack,
    GuestDetails,
    OrderSummary,
    PartyChoice,
    PaymentChoice,
    PickupChoice,
    PreferredDate,
    FORM_FIELDS,
    RouterLink,
    Skeleton,
    Link,
    PrivacyNotice,
    TermsNotice,
    PageTitle,
    ErrorText,
    PageIntro,
  ],
  template: `
    @if (placed(); as reference) {
      <h1 uiPageTitle class="mb-4">{{ heading() }}</h1>
      <!-- Opening the order first: for a guest the link is the only copy
           besides the mail. -->
      <ui-empty-state
        [icon]="circleCheckIcon"
        tone="positive"
        [message]="successMessage(reference)"
      >
        @if (placedLink(); as link) {
          <a uiButton [routerLink]="link">{{ text.successView }}</a>
        }
        <a uiButton variant="secondary" routerLink="/catalog">
          {{ text.successAction }}
        </a>
      </ui-empty-state>

      @if (guest()) {
        <p class="mt-8 max-w-xl text-sm text-ink-subtle">
          {{ invite.text }}
          <a uiLink routerLink="/register">
            {{ invite.action }}
          </a>
        </p>
      }
    } @else if (cart.isEmpty()) {
      <h1 uiPageTitle class="mb-4">{{ heading() }}</h1>
      <ui-empty-state [icon]="shoppingBasketIcon" [message]="text.emptyCart">
        <a uiButton routerLink="/catalog">
          {{ cartText.emptyAction }}
        </a>
        <a uiButton variant="secondary" routerLink="/cart">
          {{ cartText.navLabel }}
        </a>
      </ui-empty-state>
    } @else {
      <ui-summary-layout track="measure" [holdWhileStacked]="formPending()">
        <!-- In the column, so the summary starts level with the heading. -->
        <div class="max-w-xl">
          <div class="mb-8">
            <h1 uiPageTitle class="mb-2">
              {{ heading() }}
            </h1>
            <p uiPageIntro>
              {{ reviewing() ? text.review.intro : text.intro }}
            </p>
          </div>

          <!-- A guest is quoted the lowest tier. An offer, not a gate: a new
                 account needs approving first. -->
          @if (guest() && !placed()) {
            <p
              uiIconNote
              class="mb-8 max-w-xl text-sm text-ink-subtle"
              [glyph]="circleUserRoundIcon"
            >
              {{ text.signInPrompt }}
              <a
                uiLink
                [routerLink]="['/login']"
                [queryParams]="{ returnUrl: '/checkout' }"
              >
                {{ text.signInAction }}
              </a>
            </p>
          }

          @if (reviewing()) {
            <app-order-read-back
              class="max-w-xl"
              [lines]="reviewLines()"
              [blocks]="reviewBlocks()"
            />
          } @else if (formPending()) {
            <!-- Three rows depend on answers, not defaults: drawn early, the
                   form would move under the reader. -->
            @if (showFormSkeleton()) {
              <ui-skeleton class="max-w-xl" [lines]="10" />
            }
          } @else {
            <!-- A form for its fields' sake; sent by review(), not by its own
                   submit. -->
            <form [formRoot]="checkoutForm" class="max-w-xl space-y-8">
              <app-fulfilment-choice
                [method]="draft().fulfilmentMethod"
                (methodChange)="chooseFulfilment($event)"
              />

              @if (isPickup()) {
                <app-pickup-choice
                  [pickupKey]="draft().pickupLocationKey"
                  [invalid]="pickupInvalid()"
                  (pickupKeyChange)="
                    drafts.patch({ pickupLocationKey: $event })
                  "
                />
              }

              @if (addressError()) {
                <ui-warning-note>
                  {{ addressText.loadError }}
                </ui-warning-note>
              }

              <!-- The party first: it decides what the address rows are for.
                     For a guest, party and contact are one block; an account
                     answers the contact itself. -->
              @if (guest()) {
                <app-guest-details
                  [party]="draft().party"
                  [partyField]="checkoutForm.party"
                  [contact]="checkoutForm.contact"
                  (partyChange)="chooseParty($event)"
                />

                <ui-honeypot-field
                  controlId="checkout-website"
                  [field]="checkoutForm.contact.website"
                  label="Leave this field empty"
                />
              }

              @if (!guest()) {
                <app-party-choice
                  [party]="draft().party"
                  [ownAllowed]="ownPartyAllowed()"
                  [accountName]="accountName()"
                  [lastOther]="otherParty()"
                  [partyField]="checkoutForm.party"
                  (partyChange)="chooseParty($event)"
                />
              }

              <!-- The zone is re-read on blur, not per keystroke: half a
                     postcode matches the wrong zone. -->
              @if (!isPickup()) {
                <app-address-picker
                  (focusout)="commitDelivery()"
                  (picked)="commitDelivery()"
                  [heading]="addressText.deliveryHeading"
                  [addresses]="addresses()"
                  [selectedId]="draft().deliveryAddressId"
                  [form]="deliveryForm"
                  [canSave]="!guest()"
                  [reveal]="revealDelivery()"
                  [save]="saveDelivery()"
                  (selectedIdChange)="
                    drafts.patch({ deliveryAddressId: $event })
                  "
                  (saveChange)="drafts.patch({ saveDeliveryAddress: $event })"
                >
                  <!-- Absent where the deployment invoices no address of its
                         own. -->
                  @if (billingEnabled) {
                    <label uiTickLabel class="mt-4">
                      <input
                        type="checkbox"
                        uiCheckbox
                        [checked]="draft().billingSameAsDelivery"
                        (change)="toggleSameBilling()"
                      />
                      <span>{{ addressText.sameAsDelivery }}</span>
                    </label>
                  }
                </app-address-picker>
              }

              <!-- A collected order still asks for the invoice address where
                     the deployment invoices one. -->
              @if (needsBillingPicker()) {
                <app-address-picker
                  [heading]="
                    isPickup()
                      ? addressText.billingOnlyHeading
                      : addressText.billingHeading
                  "
                  [addresses]="addresses()"
                  [selectedId]="draft().billingAddressId"
                  [form]="billingForm"
                  [save]="saveBilling()"
                  (selectedIdChange)="
                    drafts.patch({ billingAddressId: $event })
                  "
                  (saveChange)="drafts.patch({ saveBillingAddress: $event })"
                />
              }

              <app-preferred-date
                [method]="draft().fulfilmentMethod"
                [date]="draft().preferredDate"
                [invalid]="preferredDateInvalid()"
                (dateChange)="drafts.patch({ preferredDate: $event })"
              />

              <app-payment-choice
                [method]="draft().paymentMethod"
                [fulfilment]="draft().fulfilmentMethod"
                [transferAllowed]="partyIsCompany()"
                [cashAllowed]="!partyIsCompany()"
                (methodChange)="drafts.patch({ paymentMethod: $event })"
              />

              <app-order-note
                [note]="draft().customerNote"
                (noteChange)="drafts.patch({ customerNote: $event })"
              />
            </form>
          }
        </div>

        <aside summary>
          <app-order-summary
            [lineCount]="cart.count()"
            [subtotalMinor]="cart.totalMinor()"
            [complete]="cart.totalComplete()"
            [shipment]="cart.estimate()"
            [taxRates]="cart.taxRates()"
          >
            @if (!isPickup()) {
              <app-delivery-zone-hint
                class="mt-3 border-t border-edge pt-3"
                [postalCode]="deliveryPostalCode()"
              />
            }
          </app-order-summary>

          <!-- No consent: an order's details are processed to fulfil it. -->
          @if (reviewing()) {
            <app-privacy-notice class="mt-5 block text-sm empty:hidden" />
          }

          <!-- Beside the button, not only at the field. -->
          @if (error(); as message) {
            <p uiErrorText class="mt-3" role="alert">
              {{ message }}
            </p>
          }

          <!-- Refusals the server would give anyway, said before the form is
                 filled. -->
          @if (staff()) {
            <p
              uiIconNote
              class="mt-3 text-sm text-ink-subtle"
              [glyph]="lockIcon"
            >
              {{ text.errors.staffAccount }}
            </p>
          } @else if (accountPhoneMissing()) {
            <p
              uiIconNote
              class="mt-3 text-sm text-ink-subtle"
              [glyph]="phoneIcon"
            >
              {{ text.phoneMissing }}
              <a uiLink routerLink="/account/edit">
                {{ text.phoneMissingAction }}
              </a>
            </p>
          }

          @if (reviewing()) {
            <!-- Sending accepts the terms, so it is said at the button. -->
            <app-terms-notice class="mt-3 block text-sm empty:hidden" />
            <button
              uiButton
              type="button"
              class="mt-3 w-full"
              [disabled]="sending() || blocked()"
              (click)="submit()"
            >
              {{ sending() ? actionText.sending : text.submit }}
            </button>
            <button
              uiButton
              variant="ghost"
              type="button"
              class="mt-2 w-full"
              (click)="backToForm()"
            >
              {{ text.review.back }}
            </button>
          } @else {
            <button
              uiButton
              type="button"
              class="mt-5 w-full"
              (click)="review()"
            >
              {{ text.review.send }}
            </button>
            <a uiButton variant="ghost" routerLink="/cart" class="mt-2 w-full">
              {{ text.review.backToCart }}
            </a>
          }
        </aside>
      </ui-summary-layout>
    }
  `,
})
export class CheckoutPage {
  protected readonly circleCheckIcon = circleCheckIcon;
  protected readonly shoppingBasketIcon = shoppingBasketIcon;
  protected readonly circleUserRoundIcon = circleUserRoundIcon;
  protected readonly lockIcon = lockIcon;
  protected readonly phoneIcon = phoneIcon;
  protected readonly cart = inject(CartService);
  protected readonly drafts = inject(CheckoutDraftService);
  protected readonly draft = this.drafts.draft;

  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly locations = this.config.pickup?.locations ?? [];
  private readonly book = inject(AddressesService);
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly text = inject(STOREFRONT_TEXT).checkout;
  protected readonly invite = inject(STOREFRONT_TEXT).auth.registerInvite;
  protected readonly cartText = inject(STOREFRONT_TEXT).cart;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly addressText = this.text.addresses;

  protected readonly guest = computed(() => this.auth.user() === null);

  /** After `guest`: who is asking decides which party fields are required. */
  private readonly forms = createCheckoutForms({
    guest: this.guest,
    party: () => this.draft().party,
    deliveryTyped: () => this.deliveryTyped(),
    billingTyped: () => this.billingTyped(),
  });

  protected readonly checkoutForm = this.forms.field;
  protected readonly deliveryForm = this.forms.delivery;
  protected readonly billingForm = this.forms.billing;

  /** Idle for a guest, rather than a 401. A failure leaves the pickers on their
   * own fields. */
  private readonly saved = resource({
    params: () => (this.guest() ? undefined : true),
    loader: () => this.book.list(),
  });
  private readonly profile = resource({
    params: () => (this.guest() ? undefined : true),
    loader: () => this.account.getProfile(),
  });

  protected readonly addresses = computed(() => this.saved.value() ?? []);
  protected readonly addressError = computed(() => this.saved.error() != null);

  protected readonly isPickup = computed(
    () => this.draft().fulfilmentMethod === 'pickup',
  );
  /** FR-CART-07: without it, no invoice address is asked for or sent. */
  protected readonly billingEnabled = this.config.billingAddressEnabled;

  /** Pickup always asks; delivery once the invoice goes elsewhere. */
  protected readonly needsBillingPicker = computed(
    () =>
      this.billingEnabled &&
      (this.isPickup() || !this.draft().billingSameAsDelivery),
  );

  /** A weekend or too soon (`order-dates`); keeps it from being sent. `today`
   * is read once, like the field's floor. */
  private readonly today = localToday();
  protected readonly preferredDateInvalid = computed(() => {
    const date = this.draft().preferredDate;
    return date !== null && !isOrderDateAllowed(date, this.today);
  });

  /** A company may pay by transfer (FR-CART-04): the account's own party is one
   * where its record carries a registration number. */
  protected readonly partyIsCompany = computed(() => {
    const party = this.draft().party;
    if (party !== 'account') return party === 'company';
    return Boolean(this.profile.value()?.companyRegistrationId);
  });

  private readonly sendingState = signal(false);
  private readonly placedState = signal<string | null>(null);
  /** The mailed link (FR-NOTIF-06), offered on the success screen: a guest has
   * no account to open the order from. */
  private readonly placedToken = signal<string | null>(null);
  private readonly errorState = signal<string | null>(null);
  protected readonly revealDelivery = signal(false);
  protected readonly revealBilling = signal(false);
  /** The radio group is no form field, so it cannot mark itself invalid. */
  private readonly pickupSubmitted = signal(false);

  protected readonly pickupInvalid = computed(
    () => this.pickupSubmitted() && !this.draft().pickupLocationKey,
  );

  protected readonly sending = this.sendingState.asReadonly();
  protected readonly placed = this.placedState.asReadonly();

  protected readonly placedLink = computed(() => {
    const reference = this.placedState();
    if (!reference) return null;
    if (!this.guest()) return ['/account/orders', reference];
    const token = this.placedToken();
    return token ? ['/orders', token] : null;
  });
  protected readonly error = this.errorState.asReadonly();

  /** Form or read-back. A query param, so browser Back walks the step without
   * rebuilding the component. */
  readonly step = input<string | undefined>(undefined);

  protected readonly reviewing = computed(() => this.step() === 'review');

  protected readonly heading = computed(() => {
    if (this.placed()) return this.text.successHeading;
    return this.reviewing() ? this.text.review.title : this.text.title;
  });

  /** The pickers holding a typed address: only their fields must validate. */
  private readonly deliveryTyped = computed(
    () => !this.isPickup() && this.draft().deliveryAddressId === null,
  );
  private readonly billingTyped = computed(
    () => this.needsBillingPicker() && this.draft().billingAddressId === null,
  );

  protected readonly formPending = computed(
    () =>
      !this.auth.resolved() ||
      this.profile.isLoading() ||
      this.saved.isLoading(),
  );
  protected readonly showFormSkeleton = delayedLoading(this.formPending);

  /** So returning to "somebody else" keeps its kind. */
  private readonly lastOtherParty = signal<Party>(this.config.customerTypes[0]);
  protected readonly otherParty = this.lastOtherParty.asReadonly();

  /** Whether the shop sells to the account's own kind of party (FR-AUTH-13),
   * read as the server reads it. True until the profile answers. */
  protected readonly ownPartyAllowed = computed(() => {
    const profile = this.profile.value();
    if (!profile) return true;
    const kind =
      profile.customerType !== 'person' && profile.companyRegistrationId
        ? 'company'
        : 'person';
    return this.config.customerTypes.includes(kind);
  });

  /** An account made from an email alone has no phone, and the form never asks
   * a customer for one: the refusal would name a field nobody saw. False while
   * loading. */
  protected readonly accountPhoneMissing = computed(() => {
    if (this.guest() || this.staff() || this.profile.isLoading()) return false;
    const profile = this.profile.value();
    return !!profile && !profile.phone?.trim();
  });

  protected readonly blocked = computed(
    () => this.staff() || this.accountPhoneMissing(),
  );

  /** Staff do not buy: the API refuses it, and this spares them the form. */
  protected readonly staff = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'admin' || role === 'manager';
  });

  protected readonly saveDelivery = computed(
    () => this.draft().saveDeliveryAddress,
  );
  protected readonly saveBilling = computed(
    () => this.draft().saveBillingAddress,
  );

  /** Its company, unless registered as a person; an older account with no type
   * keeps its company name. The server applies the same rule. Null until the
   * profile answers. */
  protected readonly accountName = computed(() => {
    const profile = this.profile.value();
    if (!profile) return null;
    const person = formatPersonName(profile.firstName, profile.lastName);
    const name =
      (profile.customerType !== 'person' && profile.companyName) ||
      person ||
      profile.companyName;
    return name || null;
  });

  /** The typed postcode as of the last blur or suggestion. */
  private readonly committedDelivery = signal({ postalCode: '' });

  private readonly chosenDelivery = computed(() =>
    this.addresses().find((row) => row.id === this.draft().deliveryAddressId),
  );

  protected readonly deliveryPostalCode = computed(
    () =>
      this.chosenDelivery()?.postalCode ?? this.committedDelivery().postalCode,
  );

  /** Compared first, so tabbing through fields does not redraw the card. */
  protected commitDelivery(): void {
    const postalCode = this.deliveryForm.field.postalCode().value();
    if (this.committedDelivery().postalCode === postalCode) return;
    this.committedDelivery.set({ postalCode });
  }

  /** The same resolutions the submission builds from, so shown and sent cannot
   * differ. */
  private readonly readBack = createCheckoutReadBack({
    draft: this.draft,
    isPickup: this.isPickup,
    needsBillingPicker: this.needsBillingPicker,
    billingEnabled: this.billingEnabled,
    guest: this.guest,
    accountName: this.accountName,
    addressFor: (id, form) => this.addressFor(id, form),
    deliveryForm: this.deliveryForm,
    billingForm: this.billingForm,
    typedParty: () => this.checkoutForm.party().value(),
    guestName: () => this.checkoutForm.contact.name().value(),
  });

  protected readonly reviewLines = this.readBack.lines;
  protected readonly reviewBlocks = this.readBack.blocks;

  private readonly submission = createCheckoutSubmission({
    forms: this.forms,
    draft: this.draft,
    guest: this.guest,
    isPickup: this.isPickup,
    billingEnabled: this.billingEnabled,
    needsBillingPicker: this.needsBillingPicker,
    deliveryTyped: this.deliveryTyped,
    billingTyped: this.billingTyped,
    preferredDateInvalid: this.preferredDateInvalid,
    profile: () => this.profile.value(),
    accountName: this.accountName,
    addressFor: (id, form) => this.addressFor(id, form),
  });

  constructor() {
    usePageSeo({ name: () => this.text.title });

    // A read-back reached directly with nothing to send goes to the form, once
    // the account and book have answered.
    effect(() => {
      if (
        !this.reviewing() ||
        this.profile.isLoading() ||
        this.saved.isLoading()
      ) {
        return;
      }
      if (!this.submission.build()) this.goToStep(undefined);
    });

    // A draft outlives its session: a book row this visitor cannot see falls
    // back to the fields.
    effect(() => {
      if (!this.auth.resolved() || this.saved.isLoading()) return;
      const rows = this.addresses();
      const offered = (id: string | null) =>
        id === null || rows.some((row) => row.id === id);

      const draft = untracked(() => this.draft());
      const changes: Partial<CheckoutDraft> = {};
      if (!offered(draft.deliveryAddressId)) changes.deliveryAddressId = null;
      if (!offered(draft.billingAddressId)) changes.billingAddressId = null;
      if (Object.keys(changes).length) {
        untracked(() => this.drafts.patch(changes));
      }
    });

    // Not known on the first frame. A guest has no account to invoice, and
    // nobody may invoice a kind the shop does not sell to (FR-AUTH-13).
    effect(() => {
      if (!this.auth.resolved()) return;
      const party = untracked(() => this.draft().party);
      const accepted = this.config.customerTypes;
      const refused =
        party === 'account'
          ? this.guest() || !this.ownPartyAllowed()
          : !accepted.includes(party);
      if (refused) untracked(() => this.chooseParty(this.lastOtherParty()));
    });

    // Each party has one method (FR-CART-04: transfer for a company, cash
    // otherwise), so a change of party moves it.
    effect(() => {
      const wanted = this.partyIsCompany() ? 'bank-transfer' : 'cash';
      if (this.draft().paymentMethod !== wanted) {
        this.drafts.patch({ paymentMethod: wanted });
      }
    });

    // Only the first time, so a later re-read cannot undo the customer's
    // choice.
    effect(() => {
      const rows = this.saved.value();
      if (!rows?.length || this.drafts.draft().addressesSeeded) return;
      this.drafts.patch({
        addressesSeeded: true,
        deliveryAddressId: this.draft().deliveryAddressId ?? rows[0].id,
        billingAddressId: this.draft().billingAddressId ?? rows[0].id,
      });
    });

    // One collection point answers itself. An effect, as a restored draft
    // arrives on pickup without a click.
    effect(() => {
      if (this.locations.length !== 1) return;
      if (this.draft().fulfilmentMethod !== 'pickup') return;
      if (this.draft().pickupLocationKey !== null) return;
      this.drafts.patch({ pickupLocationKey: this.locations[0].key });
    });

    this.forms.restore(this.draft());
    // A restored date may have passed; dropped, as no date is the default.
    if (this.preferredDateInvalid()) this.drafts.patch({ preferredDate: null });
    this.commitDelivery();
    this.chooseParty(this.draft().party);
    // Through the computed, so the draft this writes does not rerun it.
    const party = computed(() => this.draft().party);
    effect(() => {
      const { contact, party: typed } = this.checkoutForm().value();
      const name = party() === 'company' ? typed.companyName : typed.personName;
      const draft = {
        newDeliveryAddress: this.deliveryForm.value(),
        newBillingAddress: this.billingForm.value(),
        contact: {
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
        },
        otherPartyName: name.trim() || null,
        otherPartyId: typed.companyId.trim() || null,
      };
      untracked(() => this.drafts.patch(draft));
    });
  }

  protected chooseFulfilment(method: FulfilmentMethod): void {
    this.drafts.patch({ fulfilmentMethod: method });
  }

  /** Remembers the last "somebody else" kind. */
  protected chooseParty(party: Party): void {
    this.drafts.patch({ party });
    if (party !== 'account') this.lastOtherParty.set(party);
  }

  protected toggleSameBilling(): void {
    this.drafts.patch({
      billingSameAsDelivery: !this.draft().billingSameAsDelivery,
    });
  }

  protected review(): void {
    this.errorState.set(null);
    this.markProblems();

    if (!this.submission.build()) {
      this.errorState.set(this.text.errors.incomplete);
      return;
    }
    this.goToStep('review');
  }

  /** From here on every field shows its error, visited or not. */
  private markProblems(): void {
    this.pickupSubmitted.set(true);
    submitAttempt(this.checkoutForm).set(true);
    if (this.deliveryTyped()) submitAttempt(this.deliveryForm.field).set(true);
    if (this.billingTyped()) submitAttempt(this.billingForm.field).set(true);

    // A compact address hides postcode and city: unfolded only where invalid.
    this.revealDelivery.set(
      this.deliveryTyped() && this.checkoutForm.delivery().invalid(),
    );
    this.revealBilling.set(
      this.billingTyped() && this.checkoutForm.billing().invalid(),
    );
  }

  protected backToForm(): void {
    this.errorState.set(null);
    this.goToStep(undefined);
  }

  private goToStep(step: string | undefined): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: step ?? null },
      queryParamsHandling: 'merge',
    });
    // One document: without this the second screen opens scrolled.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }

  protected successMessage(reference: string): string {
    return fillText(this.text.success, { reference });
  }

  /** Sends the order request (FR-CART-03/04); the server re-checks everything.
   * */
  protected async submit(): Promise<void> {
    if (this.sendingState() || this.blocked()) return;
    this.errorState.set(null);

    const submission = this.submission.build();
    if (!submission) {
      // Something changed under the read-back: back to the form.
      this.markProblems();
      this.errorState.set(this.text.errors.incomplete);
      this.goToStep(undefined);
      return;
    }

    this.sendingState.set(true);
    try {
      const result = await this.orders.submit(submission);
      if (result.ok) {
        await this.fileTypedAddresses();
        this.placedState.set(result.reference);
        this.placedToken.set(result.publicToken);
        this.cart.clear();
        this.drafts.clear();
        this.goToStep(undefined);
        return;
      }
      if (result.code === 'cart-changed') {
        // Corrected figures first, then the message about them.
        this.cart.applyPreview(result.preview);
      }
      this.errorState.set(this.submission.refusal(result.code));
    } catch {
      this.errorState.set(this.text.errors.generic);
    } finally {
      this.sendingState.set(false);
    }
  }

  /** The chosen row, or what is in the picker's own fields. */
  private addressFor(
    id: string | null,
    form: AddressForm,
  ): AddressInput | null {
    if (id === null) return form.value();
    const row = this.addresses().find((address) => address.id === id);
    if (!row) return null;
    const { street, street2, postalCode, city, region, country, label } = row;
    return { label, street, street2, postalCode, city, region, country };
  }

  /** After the order, so a refused one adds no rows. Best effort: the order is
   * placed either way. */
  private async fileTypedAddresses(): Promise<void> {
    if (this.guest()) return;
    const draft = this.draft();
    const wanted: AddressInput[] = [];
    if (this.deliveryTyped() && draft.saveDeliveryAddress) {
      wanted.push(this.deliveryForm.value());
    }
    if (this.billingTyped() && draft.saveBillingAddress) {
      wanted.push(this.billingForm.value());
    }
    for (const address of wanted) {
      try {
        await this.book.create(address);
      } catch {
        // The order is placed, which is what was asked for.
      }
    }
  }
}
