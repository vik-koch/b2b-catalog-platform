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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AddressInput,
  emailSchema,
  fillText,
  FulfilmentMethod,
  isOrderDateAllowed,
  localToday,
  OrderContact,
  OrderSubmission,
  PartySuggestion,
  unitQuantity,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../catalog/price';
import { formatUnitQuantity } from '../catalog/quantity';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { AccountService } from '../account/account.service';
import { AuthService } from '../auth/auth.service';
import { AddressesService } from '../addresses/addresses.service';
import { addressLines } from '../addresses/address-format';
import { createAddressForm } from '../addresses/address-form';
import { CartService, CartStoredLine } from '../cart/cart.service';
import { delayedLoading } from '../core/delayed-loading';
import {
  canonicalPhone,
  companyIdFormat,
  phoneValidators,
} from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { usePageSeo } from '../core/page-seo';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { EmptyState } from '../ui/empty-state';
import { Icon } from '../ui/icons/icon';
import { Skeleton } from '../ui/skeleton';
import { OrderSummary } from '../cart/order-summary';
import { AddressPicker } from './address-picker';
import { GuestDetails } from './guest-details';
import {
  CheckoutDraft,
  CheckoutDraftService,
  PartyChoice as Party,
} from './checkout-draft.service';
import { DeliveryZoneHint } from './delivery-zone-hint';
import { FulfilmentChoice } from './fulfilment-choice';
import { OrderNote } from './order-note';
import {
  OrderReadBack,
  ReadBackLine,
  ReviewBlock,
} from '../orders/order-read-back';
import { PartyChoice } from './party-choice';
import { PaymentChoice } from './payment-choice';
import { OrdersService, SubmitOrderResult } from '../orders/orders.service';
import { PickupChoice } from './pickup-choice';
import { PreferredDate } from './preferred-date';
import { AddressForm } from '../addresses/address-form';

/**
 * The checkout form (FR-CART-03/04/07/09): one screen covering how the goods
 * arrive, who is invoiced and where, when it is wanted and how it is paid —
 * followed by a preview of the whole order and a send button.
 *
 * One form rather than a wizard because every question here has a working
 * default, so for most orders it arrives answered and the customer is reading
 * it back rather than filling it in.
 *
 * Every answer lives in the draft, not in this component: the customer can go
 * back to the cart to fix a line and return to a form still holding what they
 * said — the addresses they were typing included.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [
    AddressPicker,
    Button,
    Checkbox,
    DeliveryZoneHint,
    EmptyState,
    FulfilmentChoice,
    OrderNote,
    OrderReadBack,
    GuestDetails,
    Icon,
    OrderSummary,
    PartyChoice,
    PaymentChoice,
    PickupChoice,
    PreferredDate,
    ReactiveFormsModule,
    RouterLink,
    Skeleton,
  ],
  template: `
    @if (placed(); as reference) {
      <h1 class="mb-6 text-3xl font-medium tracking-tight">{{ heading() }}</h1>
      <!-- The cart's and the account's own empty panel, read the other way
           round: the same shape of screen says "there is nothing here" and
           "that is done". Opening the order comes first — it is what somebody
           who has just sent one wants, and for a guest the link is the only
           copy they have besides the mail. -->
      <app-empty-state
        icon="circle-check"
        tone="positive"
        [message]="successMessage(reference)"
      >
        @if (placedLink(); as link) {
          <a appButton [routerLink]="link">{{ text.successView }}</a>
        }
        <a appButton variant="secondary" routerLink="/catalog">
          {{ text.successAction }}
        </a>
      </app-empty-state>

      @if (guest()) {
        <p class="mt-8 max-w-xl text-sm text-muted">
          {{ text.successRegister }}
          <a routerLink="/register" class="text-primary underline">
            {{ text.successRegisterAction }}
          </a>
        </p>
      }
    } @else if (cart.isEmpty()) {
      <h1 class="mb-6 text-3xl font-medium tracking-tight">{{ heading() }}</h1>
      <app-empty-state icon="shopping-basket" [message]="text.emptyCart">
        <a appButton routerLink="/catalog">
          {{ cartText.emptyAction }}
        </a>
        <a appButton variant="secondary" routerLink="/cart">
          {{ cartText.navLabel }}
        </a>
      </app-empty-state>
    } @else {
      <!-- Form and summary, the pair the cart already draws — and at the width
           the cart draws it, not at whatever this page could get away with.
           The card is the same card on both, so a customer moving from one to
           the other at a given window size must not find it beside the content
           on one and under it on the other. The number is the cart's own: the
           width at which its lines still hold their shape beside the card
           (see cart-page.ts). The form itself is narrower than the track that
           notch buys, and the slack sits between the two columns.

           Measured on the page rather than the window for the same reason it
           is there: the frame's padding and the scrollbar are most of a
           column, and the media query cannot see either. Below the notch the
           summary sits under the form instead of beside it. -->
      <div class="@container/checkout">
        <div
          class="grid gap-8 @min-[63.75rem]/checkout:grid-cols-[36rem_20rem] @min-[63.75rem]/checkout:justify-between"
        >
          <!-- Heading and intro in the column, not above the grid: the summary
               beside them then starts level with the heading, and the same card
               sits at the same height on the cart, here, and on the read-back. -->
          <div class="max-w-xl">
            <!-- The heading and the line under it run the width of the column;
                 the form itself is narrower. A sentence set to the width of a
                 form field wraps for no reason, and the questions below want
                 the shorter measure. -->
            <div class="mb-8">
              <h1 class="mb-2 text-3xl font-medium tracking-tight">
                {{ heading() }}
              </h1>
              <p class="text-muted">
                {{ reviewing() ? text.review.intro : text.intro }}
              </p>
            </div>

            <!-- Next to the figures it is about: prices are tiered, so a
                 customer who checks out as a guest is quoted the lowest tier's.
                 An offer and not a gate — an account needs approving and could
                 not finish this order anyway. -->
            @if (guest() && !placed()) {
              <!-- Marked with the glyph the account control wears, so it reads
                   as being about an account before it is read at all. -->
              <p
                class="mb-8 flex max-w-xl items-start gap-2 text-sm text-muted"
              >
                <app-icon
                  name="circle-user-round"
                  class="mt-0.5 h-4 w-4 shrink-0 text-subtle"
                />
                <span>
                  {{ text.signInPrompt }}
                  <a
                    [routerLink]="['/login']"
                    [queryParams]="{ returnUrl: '/checkout' }"
                    class="text-primary underline"
                  >
                    {{ text.signInAction }}
                  </a>
                </span>
              </p>
            }

            @if (reviewing()) {
              <app-order-read-back
                class="max-w-xl"
                [lines]="reviewLines()"
                [blocks]="reviewBlocks()"
              />
            } @else if (formPending()) {
              <!-- The account's own party, whether a transfer can be paid and
                   which addresses are on offer are all answers, not defaults.
                   Drawing the form without them and correcting it a moment
                   later moves the page under whoever is already reading it. -->
              @if (showFormSkeleton()) {
                <app-skeleton class="max-w-xl" [lines]="10" />
              }
            } @else {
              <div class="max-w-xl space-y-8">
                <app-fulfilment-choice
                  [method]="draft().fulfilmentMethod"
                  (methodChange)="chooseFulfilment($event)"
                />

                <!-- Pickup's answer to the delivery address, in the place the
                 address stands for delivery. -->
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
                  <p class="text-sm text-amber-700">
                    {{ addressText.loadError }}
                  </p>
                }

                <!-- Whose name the invoice carries, asked before where anything
                 goes: the answer decides what the address rows below are for,
                 and it is also what unchecking "the same address" falls back
                 to — a second picker directly under the checkbox that revealed
                 it, rather than one further down the page. -->
                <!-- One block for a guest, where the party and the contact are
                     the same answer for a private person; a customer's account
                     answers the contact, and their party row offers it. -->
                @if (guest()) {
                  <app-guest-details
                    [party]="draft().party"
                    [nameControl]="contactForm.controls.name"
                    [emailControl]="contactForm.controls.email"
                    [phoneControl]="contactForm.controls.phone"
                    [companyNameControl]="partyForm.controls.companyName"
                    [companyIdControl]="partyForm.controls.companyId"
                    [companyNameInvalid]="
                      partyErrors.show(partyForm.controls.companyName)
                    "
                    [companyIdInvalid]="
                      partyErrors.show(partyForm.controls.companyId)
                    "
                    [errors]="contactErrors"
                    (partyChange)="chooseParty($event)"
                    (picked)="pickParty($event)"
                  />

                  <!-- ADR 0015's honeypot: off screen, never announced, and
                       filled only by something that is not reading. -->
                  <div class="absolute -left-[9999px]" aria-hidden="true">
                    <label for="checkout-website">Leave this field empty</label>
                    <input
                      id="checkout-website"
                      type="text"
                      tabindex="-1"
                      autocomplete="off"
                      [formControl]="contactForm.controls.website"
                    />
                  </div>
                }

                @if (!guest()) {
                  <app-party-choice
                    [party]="draft().party"
                    [accountName]="accountName()"
                    [lastOther]="otherParty()"
                    [personNameControl]="partyForm.controls.personName"
                    [companyNameControl]="partyForm.controls.companyName"
                    [companyIdControl]="partyForm.controls.companyId"
                    [personNameInvalid]="
                      partyErrors.show(partyForm.controls.personName)
                    "
                    [companyNameInvalid]="
                      partyErrors.show(partyForm.controls.companyName)
                    "
                    [companyIdInvalid]="
                      partyErrors.show(partyForm.controls.companyId)
                    "
                    (partyChange)="chooseParty($event)"
                    (picked)="pickParty($event)"
                  />
                }

                <!-- The zone is re-read when focus leaves the picker, not on
                 every keystroke: half a postcode resolves to whatever zone
                 happens to start with those digits, and a hint that flickers
                 through three areas while one is typed is worse than one that
                 waits. -->
                @if (!isPickup()) {
                  <app-address-picker
                    (focusout)="commitDelivery()"
                    (picked)="commitDelivery()"
                    [heading]="addressText.deliveryHeading"
                    [addresses]="addresses()"
                    [selectedId]="draft().deliveryAddressId"
                    [form]="deliveryForm"
                    [fieldErrors]="deliveryErrors"
                    [canSave]="!guest()"
                    [reveal]="revealDelivery()"
                    [save]="saveDelivery()"
                    (selectedIdChange)="
                      drafts.patch({ deliveryAddressId: $event })
                    "
                    (saveChange)="drafts.patch({ saveDeliveryAddress: $event })"
                  >
                    <!-- Checked, because one address usually serves both.
                     Unchecking is what reveals the second picker. Absent
                     altogether where the deployment invoices no address of its
                     own: there is no second address for this one to be the
                     same as. -->
                    @if (billingEnabled) {
                      <label
                        class="mt-4 flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          appCheckbox
                          class="mt-0.5"
                          [checked]="draft().billingSameAsDelivery"
                          (change)="toggleSameBilling()"
                        />
                        <span>{{ addressText.sameAsDelivery }}</span>
                      </label>
                    }
                  </app-address-picker>
                }

                <!-- Pickup asks for an address anyway, where the deployment
                 invoices one: the one on the paperwork belongs to the order,
                 not to whoever carries the goods — and with nothing being
                 delivered it is the only address asked for, which is what its
                 own heading says. A deployment that invoices no address of its
                 own asks a collected order for none at all. -->
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
                    [fieldErrors]="billingErrors"
                    [save]="saveBilling()"
                    (selectedIdChange)="
                      drafts.patch({ billingAddressId: $event })
                    "
                    (saveChange)="drafts.patch({ saveBillingAddress: $event })"
                  />
                }

                <!-- When they would like it, which belongs with the two rows that
                 decide where it is going. A wish either way: a manager
                 confirms the day, and nothing here reserves one. -->
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

                <!-- Last, because it is the only row with no default: everything
                 above arrives answered. -->
                <app-order-note
                  [note]="draft().customerNote"
                  (noteChange)="drafts.patch({ customerNote: $event })"
                />
              </div>
            }
          </div>

          <!-- Pinned once it is a column of its own: the form beside it is as
               long as the answers are, and the total is what the customer is
               reading them against. -->
          <aside
            class="max-w-xl @min-[63.75rem]/checkout:mt-9 @min-[63.75rem]/checkout:sticky @min-[63.75rem]/checkout:top-20 @min-[63.75rem]/checkout:self-start"
          >
            <app-order-summary
              [lineCount]="cart.count()"
              [subtotalMinor]="cart.totalMinor()"
              [complete]="cart.totalComplete()"
              [shipment]="cart.estimate()"
            >
              <!-- Under the figures it is about: which area the address falls
                   in, and what this order still needs to be delivered free.
                   The rule travels with it — the hint draws nothing until
                   there is a postcode, and a rule over nothing is a line
                   across the card. -->
              @if (!isPickup()) {
                <app-delivery-zone-hint
                  class="mt-3 border-t border-border pt-3"
                  [postalCode]="deliveryPostalCode()"
                />
              }
            </app-order-summary>

            <!-- Consent is asked on the second screen, beside the button that
                 acts on it: it covers sending the order, and on the form it
                 would be a promise made about something not yet read back. -->
            @if (reviewing()) {
              <label class="mt-5 flex cursor-pointer items-start gap-2 text-sm">
                <input
                  id="accept-privacy"
                  type="checkbox"
                  appCheckbox
                  class="mt-0.5"
                  aria-required="true"
                  [checked]="acceptedPrivacy()"
                  [attr.aria-invalid]="privacyMissing() || null"
                  (change)="acceptedPrivacy.set(!acceptedPrivacy())"
                />
                <span>
                  {{ text.privacyConsent }}
                  <a routerLink="/privacy" class="text-primary underline">{{
                    text.privacyLink
                  }}</a
                  ><span class="text-accent" aria-hidden="true">*</span>
                </span>
              </label>
              @if (privacyMissing()) {
                <p class="mt-1 text-sm text-red-600">
                  {{ text.privacyRequired }}
                </p>
              }
            }

            <!-- Where the ADR says a refusal belongs: beside the button, not
                 only at the field it came from. -->
            @if (error(); as message) {
              <p class="mt-3 text-sm text-red-600" role="alert">
                {{ message }}
              </p>
            }

            <!-- Said where the button is, and the button is dead. Both of
                 these are refusals the server would give anyway; giving them
                 here is the difference between a form somebody fills in for
                 nothing and one they never start. -->
            @if (staff()) {
              <p class="mt-3 flex items-start gap-2 text-sm text-muted">
                <app-icon
                  name="lock"
                  class="mt-0.5 h-4 w-4 shrink-0 text-subtle"
                />
                <span>{{ text.errors.staffAccount }}</span>
              </p>
            } @else if (accountPhoneMissing()) {
              <p class="mt-3 flex items-start gap-2 text-sm text-muted">
                <app-icon
                  name="phone"
                  class="mt-0.5 h-4 w-4 shrink-0 text-subtle"
                />
                <span>
                  {{ text.phoneMissing }}
                  <a routerLink="/account/edit" class="text-primary underline">
                    {{ text.phoneMissingAction }}
                  </a>
                </span>
              </p>
            }

            @if (reviewing()) {
              <button
                appButton
                type="button"
                class="mt-3 w-full"
                [disabled]="sending() || blocked()"
                (click)="submit()"
              >
                {{ sending() ? text.submitting : text.submit }}
              </button>
              <button
                appButton
                variant="ghost"
                type="button"
                class="mt-2 w-full"
                (click)="backToForm()"
              >
                {{ text.review.back }}
              </button>
            } @else {
              <button
                appButton
                type="button"
                class="mt-5 w-full"
                (click)="review()"
              >
                {{ text.review.send }}
              </button>
              <a
                appButton
                variant="ghost"
                routerLink="/cart"
                class="mt-2 w-full"
              >
                {{ cartText.navLabel }}
              </a>
            }
          </aside>
        </div>
      </div>
    }
  `,
})
export class CheckoutPage {
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

  protected readonly text = inject(APP_TEXT).checkout;
  protected readonly cartText = inject(APP_TEXT).cart;
  private readonly catalogText = inject(APP_TEXT).catalog;
  protected readonly addressText = this.text.addresses;

  /**
   * The party being invoiced, as its own two controls rather than as fields of
   * an address: whichever address the invoice goes to — a saved row or a typed
   * one — carries the same answer, so it cannot live on either form.
   */
  protected readonly partyForm = inject(FormBuilder).nonNullable.group({
    personName: [''],
    companyName: [''],
    companyId: ['', companyIdFormat(this.config.companyIdInput?.formats)],
  });
  protected readonly partyErrors = new FieldErrors(this.partyForm);

  /**
   * Who to talk to about the order — a guest's own, since there is no account
   * to read it off (FR-CART-03). `website` is ADR 0015's honeypot: a bot fills
   * it, a person never sees it, and this is the one form here a bot can reach.
   */
  protected readonly contactForm = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    // The contract's own rule, not Angular's: `Validators.email` accepts a
    // domain with no TLD, which the server then refuses.
    email: ['', [Validators.required, zodValidator(emailSchema, 'email')]],
    phone: ['', phoneValidators(this.config.phoneInput, true)],
    website: [''],
  });
  protected readonly contactErrors = new FieldErrors(this.contactForm);

  protected readonly deliveryForm = createAddressForm();
  protected readonly deliveryErrors = new FieldErrors(this.deliveryForm.group);
  protected readonly billingForm = createAddressForm();
  protected readonly billingErrors = new FieldErrors(this.billingForm.group);

  /**
   * A visitor with no session (FR-CART-03). Read through `resolved`, so the
   * form is never drawn for a guest and then redrawn for a customer: the two
   * ask different questions, and half of one is not a form.
   */
  protected readonly guest = computed(() => this.auth.user() === null);

  /**
   * The book and the account, neither of which a guest has. Idle rather than
   * asked and refused: an anonymous call to either is a 401 the page would
   * have to translate into "no rows", which is what not asking already says.
   *
   * A failure for a customer is not fatal either — the pickers fall back to
   * their own fields, which is the same form a guest gets.
   */
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
  /**
   * Whether this deployment invoices an address of its own (FR-CART-07). Where
   * it does not, no invoice address is asked for, offered or sent: a delivery
   * gives the one address it needs and a collected order gives none.
   */
  protected readonly billingEnabled = this.config.billingAddressEnabled;

  /** Pickup always asks; delivery only once the invoice is said to go
   * somewhere else. Neither, where there is no invoice address to ask for. */
  protected readonly needsBillingPicker = computed(
    () =>
      this.billingEnabled &&
      (this.isPickup() || !this.draft().billingSameAsDelivery),
  );

  /**
   * A date the shop does not offer — a weekend, or one too soon (`order-dates`).
   * The field says so under itself; this is what keeps it from being sent.
   * `today` is read once, like the field's own floor.
   */
  private readonly today = localToday();
  protected readonly preferredDateInvalid = computed(() => {
    const date = this.draft().preferredDate;
    return date !== null && !isOrderDateAllowed(date, this.today);
  });

  /**
   * Whether the party being invoiced is a company, which is what a bank
   * transfer needs (FR-CART-04): its own choice says so outright, and the
   * account's own party is one where its record carries a registration number.
   * The server re-checks it at submission — this only keeps the customer from
   * choosing something it would refuse.
   */
  protected readonly partyIsCompany = computed(() => {
    const party = this.draft().party;
    if (party !== 'account') return party === 'company';
    return Boolean(this.profile.value()?.companyRegistrationId);
  });

  /** Where the send button stands: idle, in flight, or done with the
   * reference the customer quotes when they ring about it. */
  private readonly sendingState = signal(false);
  private readonly placedState = signal<string | null>(null);
  /**
   * The link the confirmation mail carries (FR-NOTIF-06), kept so the screen
   * that follows can offer it too: a guest has no account to read the order
   * from, and telling them a reference without a way to open it leaves the
   * mail as their only copy.
   */
  private readonly placedToken = signal<string | null>(null);
  private readonly errorState = signal<string | null>(null);
  protected readonly acceptedPrivacy = signal(false);
  private readonly privacyChecked = signal(false);
  protected readonly revealDelivery = signal(false);
  protected readonly revealBilling = signal(false);
  /** Set when a submission was refused for want of a collection point. The
   * radio group has no control, so its error cannot come from a FieldErrors. */
  private readonly pickupSubmitted = signal(false);

  protected readonly pickupInvalid = computed(
    () => this.pickupSubmitted() && !this.draft().pickupLocationKey,
  );

  protected readonly sending = this.sendingState.asReadonly();
  protected readonly placed = this.placedState.asReadonly();

  /**
   * Where the order that was just sent can be read: the account's own page for
   * a customer, the token link for a guest. The same order either way — the
   * difference is only what the reader is holding to open it with.
   */
  protected readonly placedLink = computed(() => {
    const reference = this.placedState();
    if (!reference) return null;
    if (!this.guest()) return ['/account/orders', reference];
    const token = this.placedToken();
    return token ? ['/orders', token] : null;
  });
  protected readonly error = this.errorState.asReadonly();

  /** Only after a send has been attempted: an unticked box is not a mistake
   * until somebody tries to send without it. */
  protected readonly privacyMissing = computed(
    () => this.privacyChecked() && !this.acceptedPrivacy(),
  );

  /**
   * Which of the two screens is on (ADR 0039): the form, or the read-back
   * before sending. A query parameter rather than a field, so the browser's
   * own Back button walks the step the customer just took — and the component
   * is not rebuilt on the way, so the form it is holding survives.
   */
  readonly step = input<string | undefined>(undefined);

  protected readonly reviewing = computed(() => this.step() === 'review');

  protected readonly heading = computed(() => {
    if (this.placed()) return this.text.successHeading;
    return this.reviewing() ? this.text.review.title : this.text.title;
  });

  /** Which pickers are asking for a typed address rather than offering a row —
   * the only ones whose fields have to be valid before anything is sent. */
  private readonly deliveryTyped = computed(
    () => !this.isPickup() && this.draft().deliveryAddressId === null,
  );
  private readonly billingTyped = computed(
    () => this.needsBillingPicker() && this.draft().billingAddressId === null,
  );

  /**
   * Whether the form can be drawn yet. Three of its rows are shaped by answers
   * rather than by defaults — what the account's own party is called, whether
   * a bank transfer can be paid, and which addresses are on offer — so a form
   * drawn before they arrive is a form that rearranges itself under whoever is
   * already reading it.
   */
  protected readonly formPending = computed(
    () =>
      !this.auth.resolved() ||
      this.profile.isLoading() ||
      this.saved.isLoading(),
  );
  /** And only owned up to if the wait is long enough to notice. */
  protected readonly showFormSkeleton = delayedLoading(this.formPending);

  /** Which kind "somebody else" was last, so leaving that option and coming
   * back does not quietly reset the switch. */
  private readonly lastOtherParty = signal<Party>('person');
  protected readonly otherParty = this.lastOtherParty.asReadonly();

  /**
   * Whether this account is missing the one contact detail an order cannot be
   * placed without. A signed-in customer is never asked for their contact
   * block — it is read from their record — and staff may create an account
   * from an email alone, so an account can reach checkout with no number at
   * all. The submission is then refused for a field the form never showed,
   * which is exactly the refusal nobody can act on.
   *
   * False while the profile is still loading: the answer is not "no number"
   * until the record says so.
   */
  protected readonly accountPhoneMissing = computed(() => {
    if (this.guest() || this.staff() || this.profile.isLoading()) return false;
    const profile = this.profile.value();
    return !!profile && !profile.phone?.trim();
  });

  /** Either reason this session cannot place an order — both of which the
   * server enforces, and both of which the button reflects. */
  protected readonly blocked = computed(
    () => this.staff() || this.accountPhoneMissing(),
  );

  /**
   * Whether this session is staff, who do not buy. Role is authorization and
   * tier is pricing — separate fields on purpose — so a staff session has no
   * agreed prices, no address book worth the name and nobody to invoice, and
   * the request would land in the very inbox they answer. The API refuses it
   * outright; this is what keeps them from filling the form first.
   */
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

  /**
   * What the account is registered as: its company, unless it registered as a
   * person — one who once gave a company name is still invoiced by name. Only
   * a declared person is read that way, so an older account carrying a company
   * and no type at all keeps being named by it. The server resolves the same
   * rule when the order is placed. Null until the profile answers, which is
   * when the row falls back to a neutral word rather than an empty one.
   */
  protected readonly accountName = computed(() => {
    const profile = this.profile.value();
    if (!profile) return null;
    const person = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    const name =
      (profile.customerType !== 'person' && profile.companyName) ||
      person ||
      profile.companyName;
    return name || null;
  });

  /**
   * The typed address as the zone last saw it. A signal rather than the
   * control, because a FormControl read through a method is not a reactive
   * dependency — and a snapshot rather than every value, because it is only
   * re-read when focus leaves the picker or a suggestion fills it.
   */
  private readonly committedDelivery = signal({ postalCode: '' });

  private readonly chosenDelivery = computed(() =>
    this.addresses().find((row) => row.id === this.draft().deliveryAddressId),
  );

  protected readonly deliveryPostalCode = computed(
    () =>
      this.chosenDelivery()?.postalCode ?? this.committedDelivery().postalCode,
  );

  /** Re-reads what the picker is holding. Compared before it is written: a
   * signal set to the value it already had would redraw the card for every
   * field the customer tabs through. */
  protected commitDelivery(): void {
    const { postalCode } = this.deliveryForm.group.getRawValue();
    if (this.committedDelivery().postalCode === postalCode) return;
    this.committedDelivery.set({ postalCode });
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });

    // A read-back reached directly — a reload, or a link — with nothing behind
    // it. Only once both the account and the book have answered: until then
    // there is no order to build, and bouncing would be a race, not a guard.
    effect(() => {
      if (
        !this.reviewing() ||
        this.profile.isLoading() ||
        this.saved.isLoading()
      ) {
        return;
      }
      if (!this.buildSubmission()) this.goToStep(undefined);
    });

    // A draft outlives the session it was written in: signing out, or coming
    // back as somebody else, leaves it naming book rows this visitor cannot
    // see. An id nothing answers is not a choice — it is a picker with no row
    // selected and a submission that quietly refuses to build — so it falls
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

    // Who is asking decides both which party answers are possible and which of
    // their fields are required, and it is not known on the first frame. A
    // guest cannot invoice an account they do not have; a customer's private
    // party owes a name a guest's does not.
    effect(() => {
      if (!this.auth.resolved()) return;
      const party = untracked(() => this.draft().party);
      if (this.guest() && party === 'account') {
        untracked(() => this.chooseParty('person'));
        return;
      }
      untracked(() => this.applyPartyValidators(party));
    });

    // A payment method the party can no longer take falls back to the one it
    // can, rather than waiting to be refused: the customer changes who is
    // invoiced, and the row below it stops offering what it just offered. The
    // two rules are opposites (FR-CART-04) — a transfer invoices a company,
    // cash is not taken from one — so today each party has exactly one method
    // to fall back to.
    effect(() => {
      const wanted = this.partyIsCompany() ? 'bank-transfer' : 'cash';
      if (this.draft().paymentMethod !== wanted) {
        this.drafts.patch({ paymentMethod: wanted });
      }
    });

    // The book decides the default only the first time it arrives: the one
    // saved address, or the first of several. A customer who then chose "a
    // different address" must not have that undone by a re-read.
    effect(() => {
      const rows = this.saved.value();
      if (!rows?.length || this.drafts.draft().addressesSeeded) return;
      this.drafts.patch({
        addressesSeeded: true,
        deliveryAddressId: this.draft().deliveryAddressId ?? rows[0].id,
        billingAddressId: this.draft().billingAddressId ?? rows[0].id,
      });
    });

    // Pickup at a shop with one collection point answers itself: a list of one
    // is not a question, and leaving it unanswered would fail a submission over
    // a choice the customer was never really given. An effect rather than part
    // of the click, because a draft restored from a previous visit arrives on
    // pickup without ever passing through one.
    effect(() => {
      if (this.locations.length !== 1) return;
      if (this.draft().fulfilmentMethod !== 'pickup') return;
      if (this.draft().pickupLocationKey !== null) return;
      this.drafts.patch({ pickupLocationKey: this.locations[0].key });
    });

    // The addresses being typed, and the typed party, kept in the draft so a
    // trip back to the cart does not empty them.
    this.restoreDrafted();
    // A draft written on an earlier visit can name a date this one no longer
    // offers — the day it was chosen for has since passed. Dropped rather than
    // kept and refused: no date is the form's own default and the ordinary
    // answer, and a stale one nobody chose today is not worth an error over.
    if (this.preferredDateInvalid()) this.drafts.patch({ preferredDate: null });
    // A restored address was already finished with; the zone need not wait for
    // a blur that has already happened once.
    this.commitDelivery();
    this.chooseParty(this.draft().party);
    this.deliveryForm.group.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() =>
        this.drafts.patch({ newDeliveryAddress: this.deliveryForm.value() }),
      );
    this.billingForm.group.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() =>
        this.drafts.patch({ newBillingAddress: this.billingForm.value() }),
      );
    this.contactForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const { name, email, phone } = this.contactForm.getRawValue();
      this.drafts.patch({ contact: { name, email, phone } });
    });
    this.partyForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const { personName, companyName, companyId } =
        this.partyForm.getRawValue();
      const name = this.draft().party === 'company' ? companyName : personName;
      this.drafts.patch({
        otherPartyName: name.trim() || null,
        otherPartyId: companyId.trim() || null,
      });
    });
  }

  /** What the draft was holding when this page was last left. */
  private restoreDrafted(): void {
    const draft = this.draft();
    if (draft.newDeliveryAddress)
      this.deliveryForm.fill(draft.newDeliveryAddress);
    if (draft.newBillingAddress) this.billingForm.fill(draft.newBillingAddress);
    if (draft.contact) {
      this.contactForm.patchValue(draft.contact, { emitEvent: false });
    }
    // Only the chosen party's own fields: the other branch is empty, which is
    // what it is on a form that has never been touched.
    this.partyForm.setValue({
      personName: draft.party === 'person' ? (draft.otherPartyName ?? '') : '',
      companyName:
        draft.party === 'company' ? (draft.otherPartyName ?? '') : '',
      companyId: draft.party === 'company' ? (draft.otherPartyId ?? '') : '',
    });
  }

  protected chooseFulfilment(method: FulfilmentMethod): void {
    this.drafts.patch({ fulfilmentMethod: method });
  }

  /**
   * The party's own fields are required only while that party is chosen, and
   * are cleared on the way out: a hidden branch must be inert rather than
   * merely invisible, or an abandoned answer is submitted unseen.
   *
   * A person gives a name; a company gives a name and a number, on the rule
   * registration applies — which is why a sole trader needs no case of its own.
   * Each has its own control, so leaving one branch does not carry what was
   * typed there into the other.
   */
  protected chooseParty(party: Party): void {
    // Before the controls are touched: what they write into the draft depends
    // on which party is chosen, and they fire on the way through.
    this.drafts.patch({ party });
    if (party !== 'account') this.lastOtherParty.set(party);
    this.applyPartyValidators(party);
  }

  /**
   * Which of the party's fields are required, given who is asking. A guest's
   * private party has no name field of its own — they are the contact, and
   * asking a person for their name twice is asking one of the two for nothing.
   */
  private applyPartyValidators(party: Party): void {
    const { personName, companyName, companyId } = this.partyForm.controls;

    personName.setValue(party === 'person' ? personName.value : '');
    companyName.setValue(party === 'company' ? companyName.value : '');
    companyId.setValue(party === 'company' ? companyId.value : '');

    personName.setValidators(
      party === 'person' && !this.guest() ? Validators.required : [],
    );
    companyName.setValidators(party === 'company' ? Validators.required : []);
    companyId.setValidators(
      party === 'company'
        ? [
            Validators.required,
            companyIdFormat(this.config.companyIdInput?.formats),
          ]
        : [],
    );

    personName.updateValueAndValidity();
    companyName.updateValueAndValidity();
    companyId.updateValueAndValidity();
  }

  /** A picked company fills both halves at once — the provider takes either as
   * its query, so whichever field was being typed in, the other follows. */
  protected pickParty(suggestion: PartySuggestion): void {
    this.partyForm.patchValue({
      companyName: suggestion.name,
      ...(suggestion.registrationId
        ? { companyId: suggestion.registrationId }
        : {}),
    });
  }

  protected toggleSameBilling(): void {
    this.drafts.patch({
      billingSameAsDelivery: !this.draft().billingSameAsDelivery,
    });
  }

  /**
   * The answers, resolved for the read-back — the same resolutions the
   * submission is built from, so what is shown and what is sent cannot differ.
   */
  /**
   * The cart's lines as the read-back states them: the quantity in the unit
   * the line was bought through and, where that is not the piece, what it
   * comes to in pieces — a unit is a lens on a piece count (FR-UNIT-01), and
   * this is the one screen where the figure the shop actually picks is worth
   * spelling out beside the one that was ordered.
   */
  protected readonly reviewLines = computed<ReadBackLine[]>(() =>
    this.cart.lines().map((line) => ({
      key: line.slug,
      name: line.name,
      note: line.note,
      quantity: this.lineQuantity(line),
      // A dash rather than a zero: a line the shop cannot price yet is not a
      // free one, and the summary beside this says so in full.
      total:
        line.lineTotalMinor === null
          ? '—'
          : formatPriceMinor(line.lineTotalMinor, this.config.catalog.currency),
    })),
  );

  private lineQuantity(line: CartStoredLine): string {
    const review = this.text.review;
    const units = this.catalogText.units;
    const qty = formatUnitQuantity(
      unitQuantity(line.packaging, line.unit, line.pieces) ?? line.pieces,
      this.config.catalog.currency,
    );
    const unit = units[line.unit];
    if (line.unit === 'piece') {
      return fillText(review.quantity, { qty, unit });
    }
    return fillText(review.quantityPieces, {
      qty,
      unit,
      pieces: formatUnitQuantity(line.pieces, this.config.catalog.currency),
      pieceUnit: units.piece,
    });
  }

  protected readonly reviewBlocks = computed<ReviewBlock[]>(() => {
    const draft = this.draft();
    const review = this.text.review;
    const fulfilment = this.text.fulfilment;

    const arrival = this.isPickup()
      ? [fulfilment.pickupTitle, ...this.pickupLines()]
      : [
          fulfilment.deliveryTitle,
          ...this.addressLines(
            this.addressFor(draft.deliveryAddressId, this.deliveryForm),
          ),
        ];

    // The party, and where its invoice goes — the second half only where the
    // deployment invoices an address at all.
    const invoice = [this.partyName()];
    if (this.needsBillingPicker()) {
      invoice.push(
        ...this.addressLines(
          this.addressFor(draft.billingAddressId, this.billingForm),
        ),
      );
    } else if (this.billingEnabled) {
      invoice.push(review.billingSame);
    }

    const blocks: ReviewBlock[] = [
      { heading: review.fulfilment, lines: arrival },
      { heading: review.invoice, lines: invoice },
      {
        // The form's own words for the question, so the read-back is the same
        // question and not a shorter one: what is recorded is a wish.
        heading: this.isPickup()
          ? this.text.timing.pickupLabel
          : this.text.timing.deliveryLabel,
        lines: [
          draft.preferredDate
            ? this.formatDate(draft.preferredDate)
            : review.whenAny,
        ],
      },
      {
        heading: review.payment,
        lines: [
          draft.paymentMethod === 'bank-transfer'
            ? this.text.payment.transferTitle
            : this.text.payment.cashTitle,
        ],
      },
    ];
    // Only where there is one: an empty heading is a question the customer
    // answered by leaving it alone.
    if (draft.customerNote) {
      blocks.push({ heading: review.note, lines: [draft.customerNote] });
    }
    // A blank line would be a claim that something was answered with nothing.
    return blocks.map((block) => ({
      ...block,
      lines: block.lines.filter((line) => line.trim().length > 0),
    }));
  });

  /** The chosen collection point, as it is configured. */
  private pickupLines(): string[] {
    const point = this.locations.find(
      (location) => location.key === this.draft().pickupLocationKey,
    );
    return point ? [point.name, point.address] : [];
  }

  /** Who the invoice is made out to — the account's own party, or the one the
   * form named. The number under the name, where there is one. */
  private partyName(): string {
    const draft = this.draft();
    if (draft.party === 'account') {
      return this.accountName() ?? this.text.party.own;
    }
    const { personName, companyName, companyId } = this.partyForm.getRawValue();
    const name =
      draft.party === 'company'
        ? companyName
        : this.guest()
          ? this.contactForm.controls.name.value
          : personName;
    return draft.party === 'company' && companyId.trim()
      ? `${name.trim()} · ${companyId.trim()}`
      : name.trim();
  }

  private addressLines(address: AddressInput | null): string[] {
    if (!address) return [];
    return addressLines(
      { ...address, id: '', createdAt: '', updatedAt: '' },
      this.config.address,
    );
  }

  private formatDate(iso: string): string {
    return new Intl.DateTimeFormat(this.config.catalog.currency.locale, {
      dateStyle: 'long',
    }).format(new Date(`${iso}T00:00:00`));
  }

  /**
   * On to the read-back, once the form actually holds an order. A refusal here
   * is the form's own — the fields have just been told to say what is wrong.
   */
  protected review(): void {
    this.errorState.set(null);
    this.markProblems();

    if (!this.buildSubmission()) {
      this.errorState.set(this.text.errors.incomplete);
      return;
    }
    this.goToStep('review');
  }

  /** From here on every field says what is wrong with it, including the ones
   * nobody visited. */
  private markProblems(): void {
    this.pickupSubmitted.set(true);
    this.partyErrors.markSubmitted();
    if (this.guest()) this.contactErrors.markSubmitted();
    if (this.deliveryTyped()) this.deliveryErrors.markSubmitted();
    if (this.billingTyped()) this.billingErrors.markSubmitted();

    // A compact address holds the postcode and the city out of sight, which is
    // exactly where a form that never got a suggestion is wrong. Opened only
    // where it is actually wanting: an address that resolved cleanly has
    // nothing to correct, and unfolding it would be noise about a field the
    // customer never had to fill.
    this.revealDelivery.set(
      this.deliveryTyped() && this.deliveryForm.group.invalid,
    );
    this.revealBilling.set(
      this.billingTyped() && this.billingForm.group.invalid,
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
    // The two screens are one document; without this the second one opens
    // wherever the first was scrolled to.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }

  protected successMessage(reference: string): string {
    return fillText(this.text.success, { reference });
  }

  /**
   * Send the order request (FR-CART-03/04). Everything is re-checked here that
   * the server re-checks again: this only spares the customer a round trip.
   *
   * Nothing is charged and nothing is booked — the request goes to a manager,
   * which is why the button says so and the screen that follows says it again.
   */
  protected async submit(): Promise<void> {
    if (this.sendingState() || this.blocked()) return;
    this.errorState.set(null);
    this.privacyChecked.set(true);
    if (!this.acceptedPrivacy()) return;

    const submission = this.buildSubmission();
    if (!submission) {
      // Only reachable if something changed under the read-back; the form is
      // where it can be corrected, so that is where the customer is put, with
      // its own fields saying what is wrong.
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
        // The corrected figures are on screen before the message explaining
        // them: the customer is reading a summary that is already right.
        this.cart.applyPreview(result.preview);
      }
      this.errorState.set(this.refusal(result.code));
    } catch {
      this.errorState.set(this.text.errors.generic);
    } finally {
      this.sendingState.set(false);
    }
  }

  /** The order as the contract wants it, or null where the form is not
   * finished — which the fields themselves have just been told to say.
   * Consent is not part of it: that is the send screen's own gate, asked after
   * this has already been built once to get there. */
  private buildSubmission(): OrderSubmission | null {
    const profile = this.profile.value();
    const draft = this.draft();

    if (this.guest()) {
      if (this.contactForm.invalid) return null;
      // A filled honeypot is a bot; the form goes no further and says nothing
      // about why (ADR 0015). The server refuses it again.
      if (this.contactForm.controls.website.value.trim()) return null;
    } else if (!profile) {
      return null;
    }
    if (this.partyForm.invalid) return null;
    if (this.deliveryTyped() && this.deliveryForm.group.invalid) return null;
    if (this.billingTyped() && this.billingForm.group.invalid) return null;
    if (this.isPickup() && !draft.pickupLocationKey) return null;
    if (this.preferredDateInvalid()) return null;

    const delivery = this.isPickup()
      ? null
      : this.addressFor(draft.deliveryAddressId, this.deliveryForm);
    // Unticked "the same address" is the only thing that makes the invoice go
    // somewhere else; ticked, it is literally the delivery one. Null where the
    // deployment invoices no address of its own — which is not "the delivery
    // address", or the order would have carried it.
    const billing = !this.billingEnabled
      ? null
      : this.needsBillingPicker()
        ? this.addressFor(draft.billingAddressId, this.billingForm)
        : delivery;
    if (this.billingEnabled && !billing) return null;

    const { personName, companyName, companyId } = this.partyForm.getRawValue();
    const contact = this.contact();
    // A guest ordering as a private person *is* the party, so the one name
    // they gave answers both. A company is its own party, with somebody at it
    // as the contact.
    const partyName =
      draft.party === 'company'
        ? companyName
        : this.guest()
          ? contact.name
          : personName;

    return {
      lines: this.cart.request(),
      contact,
      fulfilmentMethod: draft.fulfilmentMethod,
      // Null is "the party this account is registered as": its own record,
      // which the server reads rather than takes from a browser.
      party:
        draft.party === 'account' && !this.guest()
          ? null
          : {
              name: partyName.trim(),
              registrationId:
                draft.party === 'company' ? companyId.trim() : null,
            },
      deliveryAddress: delivery,
      pickupLocationKey: this.isPickup() ? draft.pickupLocationKey : null,
      billingAddress: billing,
      paymentMethod: draft.paymentMethod,
      preferredDate: draft.preferredDate,
      customerNote: draft.customerNote,
      expectedTotalMinor: this.cart.totalMinor(),
      acceptPrivacy: true,
    };
  }

  /**
   * Who to talk to about this order: the guest's own answers, or the account's
   * record. A signed-in customer is never asked, so there is one place either
   * can come from and no chance of the two disagreeing.
   */
  private contact(): OrderContact {
    if (!this.guest()) {
      const profile = this.profile.value();
      return {
        name: this.accountName() ?? profile?.email ?? '',
        email: profile?.email ?? '',
        phone: profile?.phone ?? '',
      };
    }
    const { name, email, phone } = this.contactForm.getRawValue();
    return {
      name: name.trim(),
      email: email.trim(),
      // Stored the way every other number is: the prefix the field showed plus
      // what was typed into it.
      phone: canonicalPhone(phone, this.config.phoneInput),
    };
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

  /**
   * "Save this address for next time", after the order rather than before it:
   * a book that gained a row from an order that was then refused is a book the
   * customer has to tidy. Best effort — the order is placed either way, and a
   * full book is not something to interrupt a confirmation with.
   */
  private async fileTypedAddresses(): Promise<void> {
    // No account, no book: there is nowhere to keep it.
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
        // Nothing to say: the order is placed, which is what was asked for.
      }
    }
  }

  /** A refusal in the customer's words. The API answers with a code and never
   * with a sentence, so every one of them is named in the text catalog. */
  private refusal(
    code: Exclude<SubmitOrderResult, { ok: true }>['code'],
  ): string {
    const errors = this.text.errors;
    switch (code) {
      case 'invalid-company-id':
        return errors.invalidCompanyId;
      case 'unsupported-country':
        return errors.unsupportedCountry;
      case 'invalid-postal-code':
        return errors.invalidPostalCode;
      case 'unknown-pickup-location':
        return errors.unknownPickupLocation;
      case 'billing-details-required':
        return errors.billingDetailsRequired;
      case 'cash-not-available':
        return errors.cashNotAvailable;
      case 'billing-address-required':
        return errors.incomplete;
      case 'party-required':
        return errors.partyRequired;
      case 'cart-changed':
        return errors.cartChanged;
      case 'rejected':
        return errors.rejected;
      case 'staff-cannot-order':
        return errors.staffAccount;
      default:
        // A 400 the contract does not name — a body the server rejected before
        // any rule ran. Nothing useful to say about it, but silence is worse.
        return errors.generic;
    }
  }
}
