import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AdminOrderDetail,
  AdminProductListItem,
  fillText,
  ORDER_ADJUSTMENT_NOTE_MAX,
  OrderAdjustment,
  OrderAdjustmentPreview,
  PartySuggestion,
  PaymentMethod,
  ProductUnit,
} from '@b2b-catalog-platform/shared';
import { AddressFields } from '../../addresses/address-fields';
import { AddressForm } from '../../addresses/address-form';
import { CompanyFields } from '../../parties/company-fields';
import {
  canonicalPhone,
  companyIdFormat,
  emailFormat,
  phoneValidators,
  typedPhone,
} from '../../core/contact-fields';
import {
  formatPriceMinor,
  formatPriceInput,
  parsePriceInput,
} from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { debounced } from '../../core/debounced';
import { FieldErrors } from '../../core/form-errors';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { ConfirmService } from '../../ui/confirm.service';
import {
  DISCLOSURE_FRAME,
  disclosureBorder,
  DisclosureToggle,
} from '../../ui/disclosure-toggle';
import { EmailField } from '../../ui/email-field';
import { FieldLabel } from '../../ui/field-label';
import { Input } from '../../ui/input';
import { PhoneField } from '../../ui/phone-field';
import { SegmentOption, Segmented } from '../../ui/segmented';
import { SelectField } from '../../ui/select-field';
import { Skeleton } from '../../ui/skeleton';
import { WarningNote } from '../../ui/warning-note';
import { TiersService } from '../tiers/tiers.service';
import { OrderAdjustChanges, OrderChange } from './order-adjust-changes';
import { AdjustLineRow, OrderAdjustLines } from './order-adjust-lines';
import { orderBlockChanges, orderLineChanges } from './order-changes';
import { AdjustmentRefusal, AdminOrdersService } from './orders.service';

/** One line as the form holds it, before the server has priced it. */
interface DraftLine {
  /** Identity for the list's own sake: a line keeps its row — and the field
   * being typed in keeps its cursor — across reordering and removal. */
  key: string;
  slug: string;
  name: string;
  pieces: number;
  /** The customer's reading, carried. Null on a line staff just added. */
  unit: ProductUnit | null;
  note: string | null;
  /** What one piece costs, as the field holds it. */
  priceText: string;
  /**
   * Whether this line is waiting to be told what the list charges for it — a
   * line just added, or one a reprice has just asked for.
   *
   * While it is set the line travels with no price of its own, which is what
   * asks the server to price it; when the answer comes back the figure is
   * written into the field and the flag clears. The field is filled in rather
   * than left empty behind a placeholder, because the next thing a manager
   * does to a repriced line is round it — and a figure you can see but not
   * edit is one you have to retype.
   */
  fromList: boolean;
}

/** Which half of the form a refusal belongs to, so it is read beside the
 * fields that caused it rather than beside the save button. */
const REFUSAL_PART: Record<AdjustmentRefusal, 'lines' | 'details'> = {
  'unknown-product': 'lines',
  'unknown-tier': 'lines',
  'invalid-company-id': 'details',
  'billing-details-required': 'details',
  'cash-not-available': 'details',
  'billing-address-required': 'details',
  'unsupported-country': 'details',
  'invalid-postal-code': 'details',
  'unknown-pickup-location': 'details',
  'order-changed': 'details',
  // Only ever raised by the save, never by the pricing, so this half is never
  // read for it: it is said under the note instead.
  'no-change': 'details',
  'order-not-found': 'details',
};

/** How long a manager pauses before the draft is worth pricing again. */
const PREVIEW_DEBOUNCE_MS = 250;

/**
 * Adjusting an order (FR-ORD-03) — accepting it with changes, or changing one
 * already accepted.
 *
 * A whole form rather than an inline edit, because what it writes is a whole
 * new version of the order (ADR 0051): everything the checkout asked is here
 * and can be answered differently, and pressing save records the answer as it
 * now stands rather than patching the old one.
 *
 * **Nothing on this page prices anything.** Every figure comes from the
 * server's preview of the draft, so the total a manager approves is the total
 * that gets written — and the change list beside the form is the difference
 * between the version on file and that preview, which is exactly what the
 * customer will be told.
 *
 * What the customer wrote — their note, their line notes, the day they asked
 * for — is shown and not editable. It is their half of the record.
 */
@Component({
  selector: 'app-order-adjust-page',
  imports: [
    AddressFields,
    Button,
    Checkbox,
    CompanyFields,
    DisclosureToggle,
    EmailField,
    FieldLabel,
    Input,
    OrderAdjustChanges,
    OrderAdjustLines,
    PhoneField,
    ReactiveFormsModule,
    RouterLink,
    Segmented,
    SelectField,
    Skeleton,
    WarningNote,
  ],
  template: `
    @if (order(); as loaded) {
      <div class="@container/adjust">
        <div
          class="grid gap-10 @min-[63.75rem]/adjust:grid-cols-[1fr_20rem] @min-[63.75rem]/adjust:justify-between"
        >
          <div class="max-w-xl">
            <h1 class="text-3xl font-medium tracking-tight">{{ title() }}</h1>
            <p class="mt-2 text-muted">{{ text.lead }}</p>

            <!-- Amber, not red: none of these refuses the adjustment. They
                 are what a manager should have weighed before making it. -->
            @if (loaded.paymentState === 'paid') {
              <app-warning-note class="mt-4">
                {{ text.warnPaid }}
              </app-warning-note>
            }
            @if (loaded.status === 'ready') {
              <app-warning-note class="mt-4">
                {{ text.warnReady }}
              </app-warning-note>
            }
            @if (ended(loaded)) {
              <app-warning-note class="mt-4">
                {{ text.warnEnded }}
              </app-warning-note>
            }

            <!-- Two boxes, because an adjustment is two jobs. What was bought
                 and what it costs is the one a manager opens this screen for;
                 who it goes to and how it is paid is the one they scroll past
                 on the way. Each folds, so the half being worked on is the
                 half on screen. -->
            <div class="mt-4 space-y-6">
              <section
                class="rounded-md border"
                [class]="frame + ' ' + disclosureBorder(itemsOpen())"
              >
                <app-disclosure-toggle
                  [label]="text.lines.heading"
                  [count]="rows().length"
                  [countLabel]="lineCount()"
                  [open]="itemsOpen()"
                  [panelId]="itemsPanelId"
                  (toggled)="itemsOpen.set(!itemsOpen())"
                />
                @if (itemsOpen()) {
                  <div
                    [id]="itemsPanelId"
                    class="space-y-6 border-t border-border p-4"
                  >
                    <!-- Where the pricing itself was refused, said here rather
                         than beside the save button: the figures on these lines
                         are the ones that could not be worked out. -->
                    @if (refusalOn() === 'lines') {
                      <p class="text-sm text-red-600" role="alert">
                        {{ refusalMessage() }}
                      </p>
                    }
                    <app-order-adjust-lines
                      class="mb-4"
                      [lines]="rows()"
                      [disabled]="saving()"
                      (piecesChanged)="setPieces($event.index, $event.pieces)"
                      (priceChanged)="setPrice($event.index, $event.price)"
                      (moved)="moveLine($event.from, $event.to)"
                      (removed)="removeLine($event)"
                      (added)="addLine($event)"
                    />

                    <div>
                      <label appFieldLabel for="adjust-tier">
                        {{ text.tier }}
                      </label>
                      <!-- The list and the button that applies it, half the
                           row each: they are one action in two parts, and the
                           button drifting to wherever the longest tier name
                           left it read as something else on the row. -->
                      <div class="grid gap-6 sm:grid-cols-2">
                        <app-select-field>
                          <select
                            appInput
                            id="adjust-tier"
                            class="w-full"
                            [disabled]="saving()"
                            [value]="tierKey() ?? ''"
                            (change)="setTier($any($event.target).value)"
                          >
                            <option value="">
                              {{ detailText.tierDefault }}
                            </option>
                            @for (tier of tiers(); track tier.key) {
                              <option [value]="tier.key">
                                {{ tier.label }}
                              </option>
                            }
                          </select>
                        </app-select-field>
                        <button
                          appButton
                          type="button"
                          variant="secondary"
                          [disabled]="saving()"
                          (click)="repriceFromList()"
                        >
                          {{ text.reprice }}
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </section>

              <section
                class="rounded-md border"
                [class]="frame + ' ' + disclosureBorder(detailsOpen())"
              >
                <app-disclosure-toggle
                  [label]="text.detailsHeading"
                  [open]="detailsOpen()"
                  [panelId]="detailsPanelId"
                  (toggled)="detailsOpen.set(!detailsOpen())"
                />
                @if (detailsOpen()) {
                  <div
                    [id]="detailsPanelId"
                    class="space-y-8 border-t border-border p-4"
                  >
                    @if (refusalOn() === 'details') {
                      <p class="text-sm text-red-600" role="alert">
                        {{ refusalMessage() }}
                      </p>
                    }

                    <section>
                      <h2 class="mb-2 font-medium">{{ text.fulfilment }}</h2>
                      <!-- How it arrives and where it is collected from are one
                           question with two halves, so they stand on one line
                           and take half of it each: a collection point under a
                           caption of its own read as a second decision, and
                           the option it names says what it is. -->
                      <div class="grid gap-6 sm:grid-cols-2">
                        <div>
                          <label
                            appFieldLabel
                            for="adjust-fulfilment"
                            class="sr-only"
                          >
                            {{ text.fulfilment }}
                          </label>
                          <app-select-field>
                            <select
                              appInput
                              id="adjust-fulfilment"
                              class="w-full"
                              [disabled]="saving()"
                              (change)="
                                setFulfilment($any($event.target).value)
                              "
                            >
                              <option
                                value="delivery"
                                [selected]="fulfilmentMethod() === 'delivery'"
                              >
                                {{ text.delivery }}
                              </option>
                              @if (locations.length) {
                                <option
                                  value="pickup"
                                  [selected]="fulfilmentMethod() === 'pickup'"
                                >
                                  {{ text.pickup }}
                                </option>
                              }
                            </select>
                          </app-select-field>
                        </div>
                        @if (fulfilmentMethod() === 'pickup') {
                          <div>
                            <label
                              appFieldLabel
                              for="adjust-pickup"
                              class="sr-only"
                            >
                              {{ text.pickupLocation }}
                            </label>
                            <app-select-field>
                              <select
                                appInput
                                id="adjust-pickup"
                                class="w-full"
                                [disabled]="saving()"
                                (change)="
                                  pickupKey.set($any($event.target).value)
                                "
                              >
                                @for (
                                  location of locations;
                                  track location.key
                                ) {
                                  <option
                                    [value]="location.key"
                                    [selected]="pickupKey() === location.key"
                                  >
                                    {{ location.name }}
                                  </option>
                                }
                              </select>
                            </app-select-field>
                          </div>
                        }
                      </div>

                      @if (fulfilmentMethod() === 'delivery') {
                        <div class="mt-4">
                          <h3 class="mb-2 text-sm font-medium">
                            {{ text.deliveryAddress }}
                          </h3>
                          <app-address-fields
                            [form]="delivery"
                            [fieldErrors]="deliveryErrors"
                            [showLabel]="false"
                          />
                        </div>
                      }
                    </section>

                    <section>
                      <h2 class="mb-2 font-medium">{{ text.party }}</h2>
                      <!-- The same switch registration and the checkout put at
                           the top of this question, for the same reason: a
                           person is a name, a company is a name and a number,
                           and asking which kind afterwards puts a question
                           about the answer beside the question it answers.
                           Staff type this as often as the customer does, and
                           are held to the same rules. -->
                      <app-segmented
                        name="adjust-party-kind"
                        class="mb-4"
                        [options]="partyKinds"
                        [value]="partyKind()"
                        (chosen)="setPartyKind($event)"
                      />

                      @if (partyKind() === 'person') {
                        <div>
                          <label appFieldLabel for="adjust-party-person">
                            {{ text.personName }}
                            <span class="text-accent" aria-hidden="true"
                              >*</span
                            >
                          </label>
                          <input
                            appInput
                            id="adjust-party-person"
                            class="w-full"
                            autocomplete="off"
                            [formControl]="party.controls.personName"
                            [attr.aria-invalid]="invalid('personName') || null"
                          />
                          @if (invalid('personName')) {
                            <p class="mt-1 text-sm text-red-600">
                              {{ text.validation.nameRequired }}
                            </p>
                          }
                        </div>
                      } @else {
                        <app-company-fields
                          idInputId="adjust-party-id"
                          nameInputId="adjust-party-name"
                          [idControl]="party.controls.companyId"
                          [nameControl]="party.controls.companyName"
                          [text]="companyText"
                          [required]="true"
                          [idInvalid]="invalid('companyId')"
                          [nameInvalid]="invalid('companyName')"
                          (picked)="pickParty($event)"
                        />
                      }
                    </section>

                    @if (billingEnabled) {
                      <section>
                        <h2 class="mb-2 font-medium">
                          {{ text.billingAddress }}
                        </h2>
                        <app-address-fields
                          [form]="billing"
                          [fieldErrors]="billingErrors"
                          [showLabel]="false"
                        />
                      </section>
                    }

                    <section>
                      <h2 class="mb-2 font-medium">{{ text.payment }}</h2>
                      <label appFieldLabel for="adjust-payment" class="sr-only">
                        {{ text.payment }}
                      </label>
                      <app-select-field>
                        <select
                          appInput
                          id="adjust-payment"
                          class="w-full"
                          [disabled]="saving()"
                          (change)="setPayment($any($event.target).value)"
                        >
                          <!-- A company is invoiced. The two ways a private
                               customer settles up are not offered against one,
                               because the server refuses them and a dropdown
                               that offers a refusal is a dropdown people
                               learn to distrust. -->
                          @for (
                            option of paymentOptions();
                            track option.value
                          ) {
                            <option
                              [value]="option.value"
                              [selected]="paymentMethod() === option.value"
                            >
                              {{ option.label }}
                            </option>
                          }
                        </select>
                      </app-select-field>
                    </section>

                    <section>
                      <h2 class="mb-2 font-medium">{{ text.contact }}</h2>
                      <div class="grid gap-6 sm:grid-cols-[20rem_1fr]">
                        <div>
                          <label appFieldLabel for="adjust-contact-name">
                            {{ text.contactName }}
                            <span class="text-accent" aria-hidden="true"
                              >*</span
                            >
                          </label>
                          <input
                            appInput
                            id="adjust-contact-name"
                            class="w-full"
                            autocomplete="off"
                            [formControl]="contact.controls.name"
                            [attr.aria-invalid]="invalidContact('name') || null"
                          />
                          @if (invalidContact('name')) {
                            <p class="mt-1 text-sm text-red-600">
                              {{ text.validation.nameRequired }}
                            </p>
                          }
                        </div>
                        <!-- A number in the deployment's own mask is as long
                             as it will ever be, and the name beside it is
                             not: the field stops where its content does and
                             leaves the rest of the column to the row below. -->
                        <app-phone-field
                          inputId="adjust-contact-phone"
                          autocomplete="off"
                          inputWidth="w-full"
                          [label]="text.contactPhone"
                          [control]="contact.controls.phone"
                          [text]="phoneText"
                          [required]="true"
                          [invalid]="invalidContact('phone')"
                        />
                        <app-email-field
                          class="sm:col-span-2"
                          inputId="adjust-contact-email"
                          autocomplete="off"
                          [label]="text.contactEmail"
                          [control]="contact.controls.email"
                          [text]="emailText"
                          [required]="true"
                          [invalid]="invalidContact('email')"
                        />
                      </div>
                    </section>
                  </div>
                }
              </section>
            </div>

            @if (formFailure(); as message) {
              <p class="mt-6 text-sm text-red-600" role="alert">
                {{ message }}
              </p>
            }
          </div>

          <aside
            class="max-w-xl @min-[63.75rem]/adjust:mt-9 @min-[63.75rem]/adjust:sticky @min-[63.75rem]/adjust:top-20 @min-[63.75rem]/adjust:self-start"
          >
            <!-- The customer's own words first, because they are the question
                 everything below is an answer to: what they asked for, when
                 they wanted it, and what they said about it. Shown and not
                 editable — it is their half of the record. -->
            <section class="mb-6">
              <h2 class="mb-2 font-medium">{{ text.customerHeading }}</h2>
              <p class="text-sm">{{ wished(loaded) }}</p>
              <p class="text-sm text-subtle">
                {{ loaded.customerNote ?? text.customerNone }}
              </p>
            </section>

            <app-order-adjust-changes
              [heading]="text.changes.heading"
              [empty]="text.changes.none"
              [changes]="changes()"
              [pending]="changesPending()"
              [loading]="pricingLoading()"
            />

            <!-- Two things a manager should never find out about afterwards: a
                 price they moved, and a price that was already off the list
                 this order is taken from. Both are perfectly ordinary and
                 neither is visible in a total, so they are said once, here,
                 where the order is signed off. -->
            @for (notice of priceNotices(); track notice) {
              <app-warning-note class="mt-4">{{ notice }}</app-warning-note>
            }

            <!-- What the shop says it changed, beside what it changed and
                 immediately above the button that records it: it is the last
                 thing written before saving, and it is what the customer's
                 mail quotes. -->
            <div class="mt-6">
              <label appFieldLabel for="adjust-note">{{ text.note }}</label>
              <textarea
                appInput
                id="adjust-note"
                rows="3"
                class="w-full"
                [attr.maxlength]="noteMax"
                [attr.aria-invalid]="noteMissing() || null"
                [disabled]="saving()"
                [value]="note()"
                (input)="note.set($any($event.target).value)"
              ></textarea>
              <p class="mt-1 text-xs text-subtle">{{ text.noteHint }}</p>
              @if (noteMissing()) {
                <p class="mt-1 text-sm text-red-600" role="alert">
                  {{ text.noteRequired }}
                </p>
              } @else if (noteFailure(); as message) {
                <!-- "Nothing changed" names no field, so there is nowhere in
                     either fold to say it. It reads here, on the last thing
                     written before saving and beside the button that was
                     pressed. -->
                <p class="mt-1 text-sm text-red-600" role="alert">
                  {{ message }}
                </p>
              }
            </div>

            <!-- Off by default (FR-NOTIF-03). The ordinary change is agreed on
                 the phone and then confirmed, and the confirmation is the one
                 mail worth sending; this is for the change with no move behind
                 it, which nothing else would ever mention. -->
            <label class="mt-4 flex items-start gap-2 text-sm">
              <input
                appCheckbox
                type="checkbox"
                class="mt-0.5"
                [disabled]="saving()"
                [checked]="notify()"
                (change)="notify.set($any($event.target).checked)"
              />
              <span>
                {{ text.notify }}
                <span class="block text-xs text-subtle">
                  {{ text.notifyHint }}
                </span>
              </span>
            </label>

            <button
              appButton
              type="button"
              class="mt-5 w-full"
              [disabled]="saving()"
              (click)="save()"
            >
              {{ text.save }}
            </button>
            <a
              appButton
              variant="secondary"
              class="mt-3 w-full"
              [routerLink]="['/admin/orders', reference()]"
            >
              {{ text.cancel }}
            </a>
          </aside>
        </div>
      </div>
    } @else if (missing()) {
      <p class="text-muted">{{ text.notFound }}</p>
      <a appButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ detailText.back }}
      </a>
    } @else if (loadFailed()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
      <a appButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ detailText.back }}
      </a>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="8" />
    }
  `,
})
export class AdminOrderAdjustPage {
  private readonly api = inject(AdminOrdersService);
  private readonly tiersApi = inject(TiersService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;

  protected readonly text = inject(ADMIN_TEXT).orderAdjust;
  protected readonly detailText = inject(ADMIN_TEXT).orderDetail;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly locations = this.config.pickup?.locations ?? [];
  protected readonly billingEnabled = this.config.billingAddressEnabled;
  protected readonly noteMax = ORDER_ADJUSTMENT_NOTE_MAX;
  protected readonly frame = DISCLOSURE_FRAME;
  protected readonly disclosureBorder = disclosureBorder;
  protected readonly itemsPanelId = 'adjust-items';
  protected readonly detailsPanelId = 'adjust-details';
  /** Both open on arrival: an adjustment starts by reading the order, and a
   * form that opens folded is a form somebody has to unfold before they can
   * see what they came for. */
  protected readonly itemsOpen = signal(true);
  protected readonly detailsOpen = signal(true);

  readonly reference = input.required<string>();

  private readonly fb = inject(FormBuilder);

  /**
   * The party the order is invoiced to, and who to talk to about it — the same
   * two forms the checkout asks, held to the same rules.
   *
   * They are `FormGroup`s rather than plain signals because that is what makes
   * them validated: an email address the server will refuse has to be refused
   * here, and a phone number entered through the deployment's mask has to be
   * completed. The screen that *changes* an order cannot be laxer than the one
   * that placed it, or a manager correcting a typo introduces one.
   */
  protected readonly party = this.fb.nonNullable.group({
    personName: [''],
    companyName: [''],
    companyId: ['', companyIdFormat(this.config.companyIdInput?.formats)],
  });
  protected readonly contact = this.fb.nonNullable.group({
    name: ['', Validators.required],
    // The contract's own rule, not Angular's: `Validators.email` accepts a
    // domain with no TLD, which the server then refuses.
    email: ['', [Validators.required, emailFormat()]],
    phone: ['', phoneValidators(this.config.phoneInput, true)],
  });
  /** A company is a party with a registration number, which is the only thing
   * the order records. The switch is how it is asked, not a third field. */
  protected readonly partyKind = signal<'person' | 'company'>('company');

  protected readonly delivery = new AddressForm();
  protected readonly billing = new AddressForm();
  /** Which of the address messages are on screen. Nothing here marks them
   * submitted: the server prices the draft on every pause and answers with the
   * refusal itself, so a postcode is corrected by the rule that will refuse
   * the save rather than by a second copy of it. */
  protected readonly deliveryErrors = new FieldErrors(this.delivery.group);
  protected readonly billingErrors = new FieldErrors(this.billing.group);
  private readonly partyErrors = new FieldErrors(this.party);
  private readonly contactErrors = new FieldErrors(this.contact);

  protected readonly partyKinds: SegmentOption<'person' | 'company'>[] = [
    { value: 'person', label: this.text.partyKindPerson },
    { value: 'company', label: this.text.partyKindCompany },
  ];
  protected readonly emailText = {
    required: this.text.validation.emailRequired,
    invalid: this.text.validation.emailInvalid,
  };
  protected readonly phoneText = {
    required: this.text.validation.phoneRequired,
    incomplete: this.text.validation.phoneIncomplete,
  };
  /**
   * How this order may be paid, given who it is invoiced to. A company is
   * invoiced: neither cash at the door nor a card arranged on the phone leaves
   * the paper it is owed, and both are refused by the server — so they are not
   * offered here either.
   */
  protected readonly paymentOptions = computed(() => {
    const invoiced = {
      value: 'bank-transfer',
      label: this.text.paymentTransfer,
    };
    if (this.partyKind() === 'company') return [invoiced];
    return [
      { value: 'cash', label: this.text.paymentCash },
      invoiced,
      { value: 'card-later', label: this.text.paymentCard },
    ];
  });

  /**
   * What each kind of party was last paying by, so switching between them is
   * reversible.
   *
   * A company can only be invoiced, so switching to one settles the method
   * whether the manager meant to decide it or not — and switching back left a
   * private customer on a bank transfer, which the server then refused for
   * having no company number. The screen remembers instead: the answer that
   * was there comes back.
   */
  private readonly rememberedPayment: Record<
    'person' | 'company',
    PaymentMethod
  > = { person: 'cash', company: 'bank-transfer' };

  protected setPayment(method: PaymentMethod): void {
    this.paymentMethod.set(method);
    this.rememberedPayment[this.partyKind()] = method;
  }

  protected readonly companyText = {
    ...this.text.companySuggest,
    idLabel: this.text.companyId,
    nameLabel: this.text.companyName,
    idFormat: this.text.validation.companyIdFormat,
    idRequired: this.text.validation.companyIdRequired,
    nameRequired: this.text.validation.companyNameRequired,
  };

  protected invalid(
    field: 'personName' | 'companyName' | 'companyId',
  ): boolean {
    // Read through the version signal: a form control's validity is not a
    // signal, so nothing would redraw when it changed.
    this.formVersion();
    return this.partyErrors.show(this.party.controls[field]);
  }

  protected invalidContact(field: 'name' | 'email' | 'phone'): boolean {
    this.formVersion();
    return this.contactErrors.show(this.contact.controls[field]);
  }

  /**
   * Which of the party's fields are required, given which kind it is. The
   * unchosen branch is cleared as well as unrequired — a hidden branch must be
   * inert rather than merely invisible, or an abandoned answer is saved unseen.
   */
  protected setPartyKind(kind: 'person' | 'company'): void {
    if (kind !== this.partyKind()) {
      // The method follows the party, both ways.
      this.rememberedPayment[this.partyKind()] = this.paymentMethod();
      this.paymentMethod.set(this.rememberedPayment[kind]);
    }
    this.partyKind.set(kind);
    const { personName, companyName, companyId } = this.party.controls;
    // The branch that is not on screen keeps what it held. Only the chosen one
    // is ever read (`partyValue`), so nothing hidden can be saved — and a
    // manager who switches to see what the other answer looked like gets the
    // order's own back rather than an empty field to retype.
    personName.setValidators(kind === 'person' ? Validators.required : []);
    companyName.setValidators(kind === 'company' ? Validators.required : []);
    companyId.setValidators(
      kind === 'company'
        ? [
            Validators.required,
            companyIdFormat(this.config.companyIdInput?.formats),
          ]
        : [],
    );
    for (const control of [personName, companyName, companyId]) {
      control.updateValueAndValidity();
    }
  }

  /** A picked company fills both halves at once — the provider takes either as
   * its query, so whichever field was being typed in, the other follows. */
  protected pickParty(suggestion: PartySuggestion): void {
    this.party.patchValue({
      companyName: suggestion.name,
      ...(suggestion.registrationId
        ? { companyId: suggestion.registrationId }
        : {}),
    });
  }

  /** What the order says its party is, whichever branch answered it. */
  private partyValue(): { name: string; registrationId: string | null } {
    const { personName, companyName, companyId } = this.party.getRawValue();
    return this.partyKind() === 'person'
      ? { name: personName.trim(), registrationId: null }
      : {
          name: companyName.trim(),
          registrationId: companyId.trim() || null,
        };
  }

  private readonly loaded = resource({
    params: () => this.reference(),
    loader: ({ params }) => this.api.get(params),
  });
  protected readonly showSkeleton = delayedLoading(this.loaded.isLoading);
  protected readonly order = computed(() =>
    this.loaded.hasValue() ? this.loaded.value() : null,
  );
  protected readonly missing = computed(
    () => this.loaded.hasValue() && this.loaded.value() === null,
  );
  protected readonly loadFailed = computed(() => this.loaded.error() != null);

  private readonly tierList = resource({
    params: () => true,
    loader: () => this.tiersApi.list(),
  });
  protected readonly tiers = computed(() =>
    this.tierList.hasValue() ? this.tierList.value().tiers : [],
  );

  protected readonly lines = signal<DraftLine[]>([]);
  protected readonly fulfilmentMethod = signal<'delivery' | 'pickup'>(
    'delivery',
  );
  protected readonly pickupKey = signal<string | null>(null);
  protected readonly paymentMethod = signal<PaymentMethod>('bank-transfer');
  protected readonly tierKey = signal<string | null>(null);
  /** Counts the lines added on this screen, so each gets an identity of its
   * own even where two carry the same product across a removal. */
  private added = 0;
  protected readonly note = signal('');
  /** Whether to write to the customer about this change now. Off by default:
   * the move that follows carries the news. */
  protected readonly notify = signal(false);
  protected readonly saving = signal(false);
  protected readonly failed = signal<string | null>(null);
  /**
   * Whether that refusal is one about the save rather than about a field.
   * Every other one names something on the form and is said beside it; this
   * one is said under the note, where the save button is.
   */
  private readonly failedAtNote = signal(false);
  protected readonly formFailure = computed(() =>
    this.failedAtNote() ? null : this.failed(),
  );
  protected readonly noteFailure = computed(() =>
    this.failedAtNote() ? this.failed() : null,
  );
  protected readonly noteMissing = signal(false);
  /**
   * The forms are `FormGroup`s, which no signal reads. Bumped on every change
   * so the draft — and so the preview, and the change list — depends on them:
   * a form control read through a method never re-renders anything on its own.
   */
  private readonly formVersion = signal(0);

  constructor() {
    usePageSeo({ name: () => this.title(), noindex: true });

    for (const group of [
      this.delivery.group,
      this.billing.group,
      this.party,
      this.contact,
    ]) {
      (
        group.valueChanges as { subscribe(next: () => void): unknown }
      ).subscribe(() => this.formVersion.update((n) => n + 1));
    }

    // Seeded once, from the version on file: everything the form starts as is
    // what the order currently says, so an untouched form saves an unchanged
    // order.
    effect(() => {
      const order = this.order();
      if (!order) return;
      untracked(() => this.seed(order));
    });
  }

  protected title(): string {
    return fillText(this.text.title, { reference: this.reference() });
  }

  /** What is sent — to be priced, and then to be written. Null until the order
   * it is based on has loaded. */
  private readonly body = computed<OrderAdjustment | null>(() => {
    const order = this.order();
    if (!order) return null;
    this.formVersion();
    const delivery = this.fulfilmentMethod() === 'delivery';
    return {
      lines: this.lines().map((line) => ({
        slug: line.slug,
        pieces: line.pieces,
        unit: line.unit,
        note: line.note,
        priceMinor: this.priceOf(line),
      })),
      contact: {
        name: this.contact.controls.name.value.trim(),
        email: this.contact.controls.email.value.trim(),
        // Back into the one form a number is stored in. The field holds the
        // national part; the country code is the deployment's and is never
        // typed.
        phone: canonicalPhone(
          this.contact.controls.phone.value,
          this.config.phoneInput,
        ),
      },
      party: this.partyValue(),
      fulfilmentMethod: this.fulfilmentMethod(),
      deliveryAddress: delivery ? this.delivery.value() : null,
      pickupLocationKey: delivery ? null : this.pickupKey(),
      billingAddress: this.billingEnabled ? this.billing.value() : null,
      paymentMethod: this.paymentMethod(),
      tierKey: this.tierKey(),
      note: this.note().trim() || null,
      notify: this.notify(),
      basedOnRevision: order.revisionNumber,
    } as OrderAdjustment;
  });

  private readonly settledBody = debounced(this.body, PREVIEW_DEBOUNCE_MS);

  /**
   * The server's pricing of the draft. A refusal is not an error here — a
   * half-typed company number is refused by the same rule that will refuse the
   * save, and the manager is told about it now rather than at the end.
   */
  private readonly previewed = resource({
    params: () => this.settledBody(),
    // The draft that was priced travels back with the pricing. Which draft an
    // answer belongs to matters: a price is written into a field only where
    // the field asked for one *in that draft*, and an answer overtaken by a
    // newer draft — the price list switched while a line was waiting — must
    // not fill a field with a figure from the list nobody chose.
    loader: async ({ params }) =>
      params
        ? {
            asked: params,
            answer: await this.api.previewAdjustment(this.reference(), params),
          }
        : null,
  });

  /**
   * The server's last good pricing of the draft, **kept across the next one**.
   *
   * A plain `resource` empties its value while it reloads, and the draft is
   * re-priced on every pause in typing — so every keystroke blanked the line
   * totals, the quantities and the whole change list, and the screen flickered
   * on the way to saying the same thing again. What was on screen a moment ago
   * is still the truth about the draft a moment ago; it is replaced when there
   * is something to replace it with.
   *
   * A refusal keeps it too, unless the refusal is about the pricing itself. A
   * half-typed company number does not make the lines unknowable, and blanking
   * every figure on the page over one is how a manager ends up being told that
   * nothing has changed yet on a screen where they have changed six things.
   */
  protected readonly preview = linkedSignal<
    | { ok: true; preview: OrderAdjustmentPreview }
    | { ok: false; code: AdjustmentRefusal }
    | undefined,
    OrderAdjustmentPreview | null
  >({
    source: () =>
      this.previewed.hasValue()
        ? (this.previewed.value()?.answer ?? undefined)
        : undefined,
    computation: (answer, previous) => {
      if (!answer) return previous?.value ?? null;
      if (answer.ok) return answer.preview;
      return REFUSAL_PART[answer.code] === 'lines'
        ? null
        : (previous?.value ?? null);
    },
  });

  /** Why the server refused the draft as it stands, or null while it is
   * priceable. Kept for as long as the refusal is: it is a rule being broken
   * on the form, not an event. */
  protected readonly refusal = computed<AdjustmentRefusal | null>(() => {
    const answer = this.previewed.hasValue()
      ? (this.previewed.value()?.answer ?? null)
      : null;
    return answer && !answer.ok ? answer.code : null;
  });

  /** Which half of the form to say it beside. */
  protected readonly refusalOn = computed<'lines' | 'details' | null>(() => {
    const code = this.refusal();
    return code ? REFUSAL_PART[code] : null;
  });

  protected readonly refusalMessage = computed(() => {
    const code = this.refusal();
    return code ? this.text.errors[code] : '';
  });

  protected lineCount(): string {
    return fillText(this.common.countSuffix, { count: this.lines().length });
  }

  /**
   * The draft, with the server's figures beside each line.
   *
   * Paired by slug rather than by position, because that is what a line *is* —
   * a product on an order, and a product can only be on one line. Moving a
   * line then costs nothing to draw: the figures follow the product up the
   * page immediately, instead of every row below the move reading as somebody
   * else's line until the next preview came back.
   */
  protected readonly rows = computed<AdjustLineRow[]>(() => {
    const priced = new Map(
      (this.preview()?.lines ?? []).map((line) => [line.slug, line]),
    );
    return this.lines().map((line) => {
      const answer = priced.get(line.slug);
      return {
        key: line.key,
        slug: line.slug,
        name: answer?.name ?? line.name,
        pieces: line.pieces,
        priceText: line.priceText,
        quantityLabel: answer ? `${answer.quantity} ${answer.unit}` : '',
        note: line.note,
        totalLabel: answer
          ? formatPriceMinor(answer.lineTotalMinor, this.currency)
          : '',
        flags: answer?.flags ?? [],
        offList: answer ? this.offList(answer) : false,
      };
    });
  });

  /**
   * The server's answer written back into the draft, where the line was
   * waiting to be told what it costs: what the list charges becomes what the
   * field says, so the next thing done to it is an edit rather than a retype.
   */
  private readonly carryAnswer = effect(() => {
    const answered = this.previewed.hasValue() ? this.previewed.value() : null;
    const preview =
      answered?.answer && answered.answer.ok ? answered.answer.preview : null;
    if (!answered || !preview) return;
    // Only the answer to the draft as it now stands fills a field in. An
    // earlier one is still perfectly good arithmetic about an earlier draft —
    // it is what the figures beside the lines are drawn from — but writing its
    // prices into the form would put yesterday's price list into today's
    // order.
    const current = answered.asked === untracked(this.settledBody);
    const answers = new Map(preview.lines.map((line) => [line.slug, line]));
    untracked(() =>
      this.lines.update((lines) => {
        let changed = false;
        const next = lines.map((line) => {
          const answer = answers.get(line.slug);
          if (!answer) return line;
          const fill = line.fromList && current;
          // Nothing to write back: no field is waiting to be filled. Returning
          // the same object is what keeps this from feeding its own answer
          // back as a new draft.
          if (!fill) return line;
          changed = true;
          return {
            ...line,
            priceText: formatPriceInput(answer.priceMinor, this.currency),
            fromList: false,
          };
        });
        return changed ? next : lines;
      }),
    );
  });

  /**
   * What is about to change, as the customer would read it — assembled in two
   * halves, each of which answers for itself.
   *
   * The blocks compare the order on file with what the form now says, and need
   * nothing from the server: a corrected address is a change whether or not
   * the draft as a whole is priceable. The lines and the totals do need the
   * server, since nothing here prices anything, so they appear once there is a
   * pricing to compare against and say so when there is not.
   */
  protected readonly changes = computed<OrderChange[]>(() => {
    const order = this.order();
    if (!order) return [];
    const preview = this.preview();
    const config = {
      address: this.config.address,
      phoneInput: this.config.phoneInput,
      locale: this.currency.locale,
    };
    const proposed = this.proposed(order, preview);
    return [
      ...(preview
        ? orderLineChanges(order, proposed, this.text.changes, this.currency)
        : []),
      ...orderBlockChanges(order, proposed, this.detailText, config),
    ];
  });

  /**
   * What the change list cannot say yet, and why — where the reason is that
   * the draft cannot be priced at all. A form still being read by the server
   * is not that: see `pricingLoading`.
   */
  protected readonly changesPending = computed(() =>
    !this.preview() && this.refusalOn() === 'lines'
      ? this.text.changes.pricingPending
      : null,
  );

  /**
   * The first pricing of the draft is still in flight. Nothing is wrong and
   * nothing can be compared yet, so the list says neither: it stood there
   * announcing that the lines could not be worked out until the form was
   * right, on a form nobody had touched, and then replaced itself a moment
   * later with the answer.
   */
  protected readonly pricingLoading = computed(
    () => !this.preview() && this.refusalOn() !== 'lines',
  );

  /**
   * The two things about a price a manager should not have to notice for
   * themselves: one they moved on this screen, and one that was already away
   * from the list this order is taken from.
   *
   * Both are perfectly ordinary — a price agreed on the phone, an order priced
   * for a buyer whose account is not the party being invoiced — and neither
   * shows up in a total. Saying so above the save button is what turns a
   * silent difference into a deliberate one.
   */
  protected readonly priceNotices = computed<string[]>(() => {
    const order = this.order();
    const preview = this.preview();
    if (!order || !preview) return [];
    const was = new Map(order.lines.map((line) => [line.slug, line]));
    const moved = preview.lines.filter((line) => {
      const before = was.get(line.slug);
      return before !== undefined && before.priceMinor !== line.priceMinor;
    }).length;
    const offList = preview.lines.filter((line) => this.offList(line)).length;

    const notices: string[] = [];
    if (moved > 0) {
      notices.push(fillText(this.text.priceNotice.moved, { count: moved }));
    }
    if (offList > 0) {
      notices.push(
        fillText(this.text.priceNotice.offList, {
          count: offList,
          tier: this.tierLabel(),
        }),
      );
    }
    return notices;
  });

  /** Whether a priced line costs something other than what the chosen list
   * charges for it. A line the list does not price is not "off" it — there is
   * nothing to be off — so it is the price staff named and nothing more. */
  private offList(line: {
    priceMinor: number;
    listPriceMinor: number | null;
  }): boolean {
    return (
      line.listPriceMinor !== null && line.priceMinor !== line.listPriceMinor
    );
  }

  /** The chosen list, as it is named on screen. */
  private tierLabel(): string {
    const key = this.tierKey();
    if (!key) return this.detailText.tierDefault;
    return this.tiers().find((tier) => tier.key === key)?.label ?? key;
  }

  protected setPieces(index: number, pieces: number): void {
    this.lines.update((lines) =>
      lines.map((line, i) => (i === index ? { ...line, pieces } : line)),
    );
  }

  /** Typing a price answers the question a repriced line was waiting on: what
   * was typed wins over what the list was about to say. */
  protected setPrice(index: number, priceText: string): void {
    this.lines.update((lines) =>
      lines.map((line, i) =>
        i === index ? { ...line, priceText, fromList: false } : line,
      ),
    );
  }

  protected removeLine(index: number): void {
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  /**
   * Move a line up or down the order. It changes nothing about what was
   * bought — the change list ignores it, and so does the customer's mail — and
   * it exists because the alternative was removing a line and adding it back,
   * which loses the price it was agreed at.
   */
  protected moveLine(from: number, to: number): void {
    this.lines.update((lines) => {
      if (to < 0 || to >= lines.length) return lines;
      const next = [...lines];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  protected addLine(item: AdminProductListItem): void {
    this.lines.update((lines) => [
      ...lines,
      {
        // Its own identity from the moment it exists, so removing a line above
        // it does not hand its row — and whatever is being typed into it — to
        // its neighbour.
        key: `added-${++this.added}-${item.slug}`,
        slug: item.slug,
        name: item.name,
        pieces: 1,
        // Nobody has read this line in any unit yet, and it has no price of
        // its own until somebody types one: the list prices it.
        unit: null,
        note: null,
        // Nothing to show until the server has said what the list charges,
        // which it then fills in.
        priceText: '',
        fromList: true,
      },
    ]);
  }

  protected setTier(key: string): void {
    this.tierKey.set(key || null);
  }

  protected setFulfilment(method: 'delivery' | 'pickup'): void {
    this.fulfilmentMethod.set(method);
    if (method === 'pickup' && !this.pickupKey()) {
      this.pickupKey.set(this.locations[0]?.key ?? null);
    }
  }

  /**
   * Take every line's price from the chosen list (FR-CART-09) — the answer to
   * an order priced provisionally, where the customer's account and the party
   * being invoiced are not the same buyer.
   *
   * Each line is *marked* as taking the list's price rather than emptied of
   * its own: it travels with no price, which is what asks the server to price
   * it, and the answer is written into the field. A manager repricing an order
   * usually then rounds one line of it, and a field they can see through but
   * not edit would have to be retyped from the figure behind it.
   */
  protected repriceFromList(): void {
    this.lines.update((lines) =>
      lines.map((line) => ({ ...line, fromList: true })),
    );
  }

  /** An order that is over — handed over, refused or called off. Changing it
   * is allowed, and records what the shop did, but it does not put the order
   * back in anybody's queue and nothing tells the customer on its own. */
  protected ended(order: AdminOrderDetail): boolean {
    return (
      order.status === 'completed' ||
      order.status === 'declined' ||
      order.status === 'cancelled'
    );
  }

  /** The day they asked for, named as one: a date on its own under a heading
   * about the customer read as the day they ordered. */
  protected wished(order: AdminOrderDetail): string {
    return fillText(this.text.wished, { date: this.wish(order) });
  }

  private wish(order: AdminOrderDetail): string {
    if (!order.preferredDate) return this.detailText.whenAny;
    return new Date(order.preferredDate).toLocaleDateString(
      this.currency.locale,
      { dateStyle: 'long' },
    );
  }

  protected async save(): Promise<void> {
    const body = this.body();
    if (!body || this.saving()) return;

    // An order with no lines is not an order, and the contract refuses one
    // outright — said here in the screen's own words rather than let through
    // to come back as "that did not work". An order the shop will not fill at
    // all is declined, not emptied.
    if (body.lines.length === 0) {
      this.failedAtNote.set(false);
      this.failed.set(this.text.lines.empty);
      return;
    }

    // Every field the checkout asked, held to the rules the checkout held it
    // to. The screen that changes an order cannot be laxer than the one that
    // placed it, or a manager correcting a typo introduces one.
    this.partyErrors.markSubmitted();
    this.contactErrors.markSubmitted();
    this.deliveryErrors.markSubmitted();
    this.billingErrors.markSubmitted();
    this.formVersion.update((n) => n + 1);
    if (this.party.invalid || this.contact.invalid) return;

    // Asked for by the screen, optional in the contract: a person adjusting an
    // order has just been on the phone and can say what was agreed.
    if (!body.note) {
      this.noteMissing.set(true);
      return;
    }
    this.noteMissing.set(false);

    const go = await this.confirm.ask({
      heading: this.text.confirmHeading,
      message: this.text.confirmMessage,
      confirmLabel: this.text.confirm,
      cancelLabel: this.text.keep,
    });
    if (!go) return;

    this.saving.set(true);
    this.failed.set(null);
    try {
      const result = await this.api.adjust(this.reference(), body);
      if (!result.ok) {
        this.failedAtNote.set(result.code === 'no-change');
        this.failed.set(this.text.errors[result.code]);
        return;
      }
      await this.router.navigate(['/admin/orders', this.reference()]);
    } catch {
      this.failedAtNote.set(false);
      this.failed.set(this.text.errors.unknown);
    } finally {
      this.saving.set(false);
    }
  }

  /** The order as the draft proposes it, for the block-by-block comparison. */
  private proposed(
    order: AdminOrderDetail,
    preview: OrderAdjustmentPreview | null,
  ): AdminOrderDetail {
    const delivery = this.fulfilmentMethod() === 'delivery';
    const pickup = this.locations.find(
      (location) => location.key === this.pickupKey(),
    );
    return {
      ...order,
      contact: {
        name: this.contact.controls.name.value,
        email: this.contact.controls.email.value,
        phone: canonicalPhone(
          this.contact.controls.phone.value,
          this.config.phoneInput,
        ),
      },
      party: this.partyValue(),
      fulfilmentMethod: this.fulfilmentMethod(),
      deliveryAddress: delivery ? this.delivery.value() : null,
      pickup:
        !delivery && pickup
          ? {
              key: pickup.key,
              name: pickup.name,
              address: pickup.address,
            }
          : null,
      billingAddress: this.billingEnabled ? this.billing.value() : null,
      paymentMethod: this.paymentMethod(),
      // Where there is no pricing, the order's own figures stand in: the block
      // comparison never reads them, and a caller that does is asking about
      // the half this one cannot answer.
      deliveryZone: preview?.deliveryZone ?? order.deliveryZone,
      lines: preview?.lines ?? order.lines,
      totalMinor: preview?.totalMinor ?? order.totalMinor,
      shipment: preview?.shipment ?? order.shipment,
    };
  }

  /** The price a line carries, or null where the field is empty — which is
   * what asks the server to price it from the list. */
  private priceOf(line: DraftLine): number | null {
    if (line.fromList || !line.priceText.trim()) return null;
    return parsePriceInput(line.priceText, this.currency);
  }

  private seed(order: AdminOrderDetail): void {
    this.lines.set(
      order.lines.map((line, index) => ({
        key: `${index}-${line.slug}`,
        slug: line.slug,
        name: line.name,
        pieces: line.pieces,
        unit: line.unit,
        note: line.note,
        priceText: formatPriceInput(line.priceMinor, this.currency),
        fromList: false,
      })),
    );
    this.contact.setValue(
      {
        name: order.contact.name,
        email: order.contact.email,
        // Taken apart the way the field asks it: the prefix is displayed and
        // never typed, so what the control holds is the national part.
        phone: typedPhone(order.contact.phone, this.config.phoneInput),
      },
      { emitEvent: false },
    );
    // A party with a registration number is a company; one without is a
    // person. The order records no third thing, so the switch is read back
    // from what it recorded rather than stored beside it.
    const company = order.party.registrationId !== null;
    this.setPartyKind(company ? 'company' : 'person');
    this.party.setValue(
      {
        personName: company ? '' : order.party.name,
        companyName: company ? order.party.name : '',
        companyId: order.party.registrationId ?? '',
      },
      { emitEvent: false },
    );
    this.fulfilmentMethod.set(order.fulfilmentMethod);
    this.pickupKey.set(order.pickup?.key ?? this.locations[0]?.key ?? null);
    this.setPayment(order.paymentMethod);
    // An older order pairing a company with cash or an offline card: neither
    // is offered any more and the server refuses both, so the form corrects it
    // and the change list says it did.
    if (!this.paymentOptions().some((o) => o.value === this.paymentMethod())) {
      this.setPayment('bank-transfer');
    }
    this.tierKey.set(order.tierKey);
    // An order's address snapshot has no label: it was never a row in
    // anybody's book, and the field is not drawn here either.
    if (order.deliveryAddress) {
      this.delivery.fill({ ...order.deliveryAddress, label: null });
    }
    if (order.billingAddress) {
      this.billing.fill({ ...order.billingAddress, label: null });
    }
  }
}
