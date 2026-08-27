import { Component, computed, effect, inject, resource } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  FulfilmentMethod,
  PartySuggestion,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { AccountService } from '../account/account.service';
import { AddressesService } from '../addresses/addresses.service';
import { createAddressForm } from '../addresses/address-form';
import { CartService } from '../cart/cart.service';
import { companyIdFormat } from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { OrderSummary } from '../cart/order-summary';
import { AddressPicker } from './address-picker';
import {
  CheckoutDraftService,
  PartyChoice as Party,
} from './checkout-draft.service';
import { DeliveryZoneHint } from './delivery-zone-hint';
import { FulfilmentChoice } from './fulfilment-choice';
import { PartyChoice } from './party-choice';
import { PickupChoice } from './pickup-choice';

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
    FulfilmentChoice,
    OrderSummary,
    PartyChoice,
    PickupChoice,
    RouterLink,
  ],
  template: `
    <h1 class="mb-2 text-3xl font-bold tracking-tight">{{ text.title }}</h1>

    @if (cart.isEmpty()) {
      <p class="text-subtle">{{ text.emptyCart }}</p>
      <a appButton routerLink="/cart" class="mt-4">{{ cartText.navLabel }}</a>
    } @else {
      <p class="mb-8 text-muted">{{ text.intro }}</p>

      <!-- Form and summary, the pair the cart already draws. Measured on the
           page rather than the window for the same reason it is there: the
           frame's padding and the scrollbar are most of a column, and the
           media query cannot see either. Below the notch the summary sits
           under the form instead of beside it. -->
      <div class="@container/checkout">
        <div class="grid gap-8 @min-[64rem]/checkout:grid-cols-[1fr_20rem]">
          <div class="max-w-xl space-y-6">
            <app-fulfilment-choice
              [method]="draft().fulfilmentMethod"
              (methodChange)="chooseFulfilment($event)"
            />

            <!-- Pickup's answer to the delivery address, in the place the
                 address stands for delivery. -->
            @if (isPickup()) {
              <app-pickup-choice
                [pickupKey]="draft().pickupLocationKey"
                (pickupKeyChange)="drafts.patch({ pickupLocationKey: $event })"
              />
            }

            @if (addressError()) {
              <p class="text-sm text-amber-700">{{ addressText.loadError }}</p>
            }

            @if (!isPickup()) {
              <app-address-picker
                [heading]="addressText.deliveryHeading"
                [addresses]="addresses()"
                [selectedId]="draft().deliveryAddressId"
                [form]="deliveryForm"
                [fieldErrors]="deliveryErrors"
                [save]="saveDelivery()"
                (selectedIdChange)="drafts.patch({ deliveryAddressId: $event })"
                (saveChange)="drafts.patch({ saveDeliveryAddress: $event })"
              >
                <!-- Checked, because one address usually serves both.
                     Unchecking is what reveals the second picker. -->
                <label
                  class="mt-3 flex cursor-pointer items-start gap-2 text-sm"
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
              </app-address-picker>
            }

            <!-- One section, two halves: whose name the invoice carries, and
                 where it goes. Apart they read as unrelated questions, which
                 is the confusion that once put an identity on an address. -->
            <section class="space-y-4">
              <app-party-choice
                [party]="draft().party"
                [accountName]="accountName()"
                [nameControl]="partyForm.controls.name"
                [idControl]="partyForm.controls.id"
                [nameInvalid]="partyErrors.show(partyForm.controls.name)"
                [idInvalid]="partyErrors.show(partyForm.controls.id)"
                (partyChange)="chooseParty($event)"
                (picked)="pickParty($event)"
              />

              <!-- Pickup asks for an address anyway: the one on the paperwork
                   belongs to the order, not to whoever carries the goods. -->
              @if (needsBillingPicker()) {
                <app-address-picker
                  [heading]="addressText.billingHeading"
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
            </section>

            <div class="flex flex-wrap items-center gap-3 pt-2">
              <a appButton variant="secondary" routerLink="/cart">
                {{ cartText.navLabel }}
              </a>
            </div>
          </div>

          <!-- Pinned once it is a column of its own: the form beside it is as
               long as the answers are, and the total is what the customer is
               reading them against. -->
          <aside
            class="@min-[64rem]/checkout:sticky @min-[64rem]/checkout:top-20 @min-[64rem]/checkout:self-start"
          >
            <app-order-summary
              [lineCount]="cart.count()"
              [subtotalMinor]="cart.totalMinor()"
              [complete]="cart.totalComplete()"
              [shipment]="cart.estimate()"
              [delivery]="deliveryRow()"
            >
              <!-- Under the figures it is about: which area the address falls
                   in, and what this order still needs to be delivered free. -->
              @if (!isPickup()) {
                <app-delivery-zone-hint
                  class="mt-3 border-t border-border pt-3"
                  [postalCode]="deliveryPostalCode()"
                  [city]="deliveryCity()"
                />
              }
            </app-order-summary>
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

  protected readonly text = inject(APP_TEXT).checkout;
  protected readonly cartText = inject(APP_TEXT).cart;
  protected readonly addressText = this.text.addresses;

  /**
   * The party being invoiced, as its own two controls rather than as fields of
   * an address: whichever address the invoice goes to — a saved row or a typed
   * one — carries the same answer, so it cannot live on either form.
   */
  protected readonly partyForm = inject(FormBuilder).nonNullable.group({
    name: [''],
    id: ['', companyIdFormat(this.config.companyIdInput?.formats)],
  });
  protected readonly partyErrors = new FieldErrors(this.partyForm);

  /** What the delivery row of the summary says. Pickup is collected, so there
   * is no delivery to quote; otherwise the manager confirms it, which the zone
   * hint under the card qualifies. */
  protected readonly deliveryRow = computed(() =>
    this.isPickup() ? this.text.collection : null,
  );

  protected readonly deliveryForm = createAddressForm();
  protected readonly deliveryErrors = new FieldErrors(this.deliveryForm.group);
  protected readonly billingForm = createAddressForm();
  protected readonly billingErrors = new FieldErrors(this.billingForm.group);

  /** The book. A failure is not fatal: the pickers fall back to their own
   * fields, which is the same form a guest gets. */
  private readonly saved = resource({ loader: () => this.book.list() });
  private readonly profile = resource({
    loader: () => this.account.getProfile(),
  });

  protected readonly addresses = computed(() => this.saved.value() ?? []);
  protected readonly addressError = computed(() => this.saved.error() != null);

  protected readonly isPickup = computed(
    () => this.draft().fulfilmentMethod === 'pickup',
  );
  /** Pickup always asks; delivery only once the invoice is said to go
   * somewhere else. */
  protected readonly needsBillingPicker = computed(
    () => this.isPickup() || !this.draft().billingSameAsDelivery,
  );

  protected readonly saveDelivery = computed(
    () => this.draft().saveDeliveryAddress,
  );
  protected readonly saveBilling = computed(
    () => this.draft().saveBillingAddress,
  );

  /**
   * What the account is registered as: its company where it has one, its
   * holder's name otherwise. Null until the profile answers, which is when the
   * row falls back to a neutral word rather than an empty one.
   */
  protected readonly accountName = computed(() => {
    const profile = this.profile.value();
    if (!profile) return null;
    if (profile.companyName) return profile.companyName;
    const name = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    return name || null;
  });

  /**
   * The postcode and city the zone is resolved from — the chosen row's, or
   * whatever is currently typed. Read as signals rather than off the control,
   * or the hint would never redraw (a FormControl read through a method is not
   * a reactive dependency).
   */
  private readonly typedDelivery = toSignal(
    this.deliveryForm.group.valueChanges,
    { initialValue: this.deliveryForm.group.getRawValue() },
  );

  private readonly chosenDelivery = computed(() =>
    this.addresses().find((row) => row.id === this.draft().deliveryAddressId),
  );

  protected readonly deliveryPostalCode = computed(
    () =>
      this.chosenDelivery()?.postalCode ??
      this.typedDelivery().postalCode ??
      '',
  );
  protected readonly deliveryCity = computed(
    () => this.chosenDelivery()?.city ?? this.typedDelivery().city ?? '',
  );

  constructor() {
    usePageSeo({ name: () => this.text.title });

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

    // The addresses being typed, and the typed party, kept in the draft so a
    // trip back to the cart does not empty them.
    this.restoreDrafted();
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
    this.partyForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() =>
      this.drafts.patch({
        otherPartyName: this.partyForm.controls.name.value.trim() || null,
        otherPartyId: this.partyForm.controls.id.value.trim() || null,
      }),
    );
  }

  /** What the draft was holding when this page was last left. */
  private restoreDrafted(): void {
    const draft = this.draft();
    if (draft.newDeliveryAddress)
      this.deliveryForm.fill(draft.newDeliveryAddress);
    if (draft.newBillingAddress) this.billingForm.fill(draft.newBillingAddress);
    this.partyForm.setValue({
      name: draft.otherPartyName ?? '',
      id: draft.otherPartyId ?? '',
    });
  }

  /**
   * Choosing pickup where there is one collection point chooses it too: a list
   * of one is not a question, and leaving it unanswered would fail a
   * submission over a choice the customer was never really given.
   */
  protected chooseFulfilment(method: FulfilmentMethod): void {
    const only = this.locations.length === 1 ? this.locations[0].key : null;
    this.drafts.patch({
      fulfilmentMethod: method,
      ...(method === 'pickup' && this.draft().pickupLocationKey === null && only
        ? { pickupLocationKey: only }
        : {}),
    });
  }

  /**
   * The party's own fields are required only while that party is chosen, and
   * are cleared on the way out: a hidden branch must be inert rather than
   * merely invisible, or an abandoned answer is submitted unseen.
   *
   * A person gives a name; a company gives a name and a number, on the rule
   * registration applies — which is why a sole trader needs no case of its own.
   */
  protected chooseParty(party: Party): void {
    const { name, id } = this.partyForm.controls;

    if (party === 'account') {
      this.partyForm.reset({ name: '', id: '' });
      name.clearValidators();
      id.clearValidators();
    } else {
      name.setValidators(Validators.required);
      id.setValidators(
        party === 'company'
          ? [
              Validators.required,
              companyIdFormat(this.config.companyIdInput?.formats),
            ]
          : [],
      );
      if (party === 'person') id.setValue('');
    }
    name.updateValueAndValidity();
    id.updateValueAndValidity();

    this.drafts.patch({ party });
  }

  /** A picked company fills both halves at once — the provider takes either as
   * its query, so whichever field was being typed in, the other follows. */
  protected pickParty(suggestion: PartySuggestion): void {
    this.partyForm.patchValue({
      name: suggestion.name,
      ...(suggestion.registrationId ? { id: suggestion.registrationId } : {}),
    });
  }

  protected toggleSameBilling(): void {
    this.drafts.patch({
      billingSameAsDelivery: !this.draft().billingSameAsDelivery,
    });
  }
}
