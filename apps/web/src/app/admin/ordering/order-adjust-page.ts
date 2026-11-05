import {
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { useTaxStatement } from '../../platform/tax-statement';
import { apply, form, hidden, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared/platform';
import {
  ORDER_ADJUSTMENT_NOTE_MAX,
  PaymentMethod,
  AdminOrderDetail,
  OrderAdjustment,
  OrderAdjustmentPreview,
} from '@b2b-catalog-platform/shared/core/ordering';
import { AdminProductListItem } from '@b2b-catalog-platform/shared/admin/catalog';
import {
  AddressForm,
  blankAddress,
  injectAddressRules,
} from '../../core/accounts/addresses/address-form';
import { companyIdFormat } from '../../core/accounts/parties/company-id';
import { canonicalPhone, typedPhone } from '../../platform/contact-fields';
import { completeMask, emailAddress } from '../../platform/field-rules';
import { formatPriceInput } from '../../core/catalog/pricing/price';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { staffBlockLabels } from './staff-block-labels';
import { staffFields } from '../platform/staff-fields';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { debounced } from '@b2b-catalog-platform/ui/core/debounced';
import { delayedLoading } from '../../platform/delayed-loading';
import { usePageSeo } from '../../platform/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import {
  ConfirmService,
  confirmRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import {
  FieldAttempt,
  FIELD_ATTEMPT,
} from '@b2b-catalog-platform/ui/fields/field-attempt';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';
import { TiersService } from '../catalog/tiers/tiers.service';
import { OrderAdjustChanges, OrderChange } from './ui/order-adjust-changes';
import { AdjustLineRow, OrderAdjustLines } from './order-adjust-lines';
import { OrderAdjustDetails } from './ui/order-adjust-details';
import {
  AdjustAnswers,
  DraftLine,
  draftLines,
  draftPrice,
  offList,
  PartyKind,
  paymentOptions,
  priceNotices,
  REFUSAL_PART,
} from './order-adjust-draft';
import { orderBlockChanges, orderLineChanges } from './order-changes';
import { customerQuantity } from '../../core/ordering/order-formats';
import { LockedNote } from '../platform/ownership/ui/locked-note';
import { OwnershipService } from '../platform/ownership/ownership.service';
import { AdjustmentRefusal, AdminOrdersService } from './orders.service';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Hint } from '@b2b-catalog-platform/ui/fields/hint';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { SummaryLayout } from '@b2b-catalog-platform/ui/content/summary-layout';
import { CATALOG_CONFIG } from '../../core/catalog/catalog-config';

/** The typing pause before re-pricing. */
const PREVIEW_DEBOUNCE_MS = 250;

/** Adjusting an order (FR-ORD-03): a whole form, as it writes a whole new
 * version. **Nothing here prices anything**: figures come from the server's
 * preview, so the approved total is the written one, and the change list is
 * what the customer will be told. The customer's notes and date are shown, not
 * editable. */
@Component({
  selector: 'app-order-adjust-page',
  imports: [
    SummaryLayout,
    OrderAdjustDetails,
    Button,
    Checkbox,
    TickLabel,
    DisclosureToggle,
    FieldLabel,
    Input,
    OrderAdjustChanges,
    OrderAdjustLines,
    RouterLink,
    SelectInput,
    Skeleton,
    WarningNote,
    LockedNote,
    PageTitle,
    ErrorText,
    Hint,
    PageIntro,
    DisclosureFrame,
  ],
  // No <form>: the save button sits in the aside after the note.
  providers: [
    {
      provide: FIELD_ATTEMPT,
      useExisting: forwardRef(() => AdminOrderAdjustPage),
    },
  ],
  template: `
    <!-- No form while answered externally: every field would be refused. -->
    @if (locked()) {
      <div class="max-w-xl">
        <h1 uiPageTitle>{{ title() }}</h1>
        <app-locked-note class="mt-4">{{
          ownershipText.orderLocked
        }}</app-locked-note>
        <a
          uiButton
          variant="secondary"
          class="mt-5"
          [routerLink]="['/admin/orders', reference()]"
        >
          {{ text.cancel }}
        </a>
      </div>
    } @else if (order(); as loaded) {
      <ui-summary-layout track="fill">
        <div class="max-w-xl">
          <h1 uiPageTitle>{{ title() }}</h1>
          @if (text.page.intro; as intro) {
            <p uiPageIntro class="mt-2">{{ intro }}</p>
          }

          <!-- Amber: none of these refuses; they are to be weighed. -->
          @if (loaded.paymentState === 'paid') {
            <ui-warning-note class="mt-4">
              {{ text.warnPaid }}
            </ui-warning-note>
          }
          @if (loaded.status === 'ready') {
            <ui-warning-note class="mt-4">
              {{ text.warnReady }}
            </ui-warning-note>
          }
          @if (ended(loaded)) {
            <ui-warning-note class="mt-4">
              {{ text.warnEnded }}
            </ui-warning-note>
          }

          <!-- Two folds for two jobs: lines and prices, then party, delivery
                 and payment. -->
          <div class="mt-4 space-y-6">
            <section
              class="rounded-md border"
              uiDisclosureFrame
              [open]="itemsOpen()"
            >
              <ui-disclosure-toggle
                [label]="ordersText.items"
                [count]="rows().length"
                [countLabel]="lineCount()"
                [open]="itemsOpen()"
                [panelId]="itemsPanelId"
                (toggled)="itemsOpen.set(!itemsOpen())"
              />
              @if (itemsOpen()) {
                <div
                  [id]="itemsPanelId"
                  class="space-y-6 border-t border-edge p-4"
                >
                  <!-- A pricing refusal, beside the lines it could not price.
                         -->
                  @if (refusalOn() === 'lines') {
                    <p uiErrorText role="alert">
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
                    <label uiFieldLabel for="adjust-tier">
                      {{ ordersText.tier }}
                    </label>
                    <!-- List and its apply button, half the row each: one
                           action. -->
                    <div class="grid gap-6 sm:grid-cols-2">
                      <ui-select-input>
                        <select
                          uiInput
                          id="adjust-tier"
                          class="w-full"
                          [disabled]="saving()"
                          [value]="tierKey() ?? ''"
                          (change)="setTier($any($event.target).value)"
                        >
                          <option value="">
                            {{ ordersText.tierDefault }}
                          </option>
                          @for (tier of tiers(); track tier.key) {
                            <option [value]="tier.key">
                              {{ tier.label }}
                            </option>
                          }
                        </select>
                      </ui-select-input>
                      <button
                        uiButton
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
              uiDisclosureFrame
              [open]="detailsOpen()"
            >
              <ui-disclosure-toggle
                [label]="text.detailsHeading"
                [open]="detailsOpen()"
                [panelId]="detailsPanelId"
                (toggled)="detailsOpen.set(!detailsOpen())"
              />
              @if (detailsOpen()) {
                <div
                  [id]="detailsPanelId"
                  class="space-y-8 border-t border-edge p-4"
                >
                  <app-order-adjust-details
                    [form]="form"
                    [delivery]="delivery"
                    [billing]="billing"
                    [fulfilmentMethod]="fulfilmentMethod()"
                    [pickupKey]="pickupKey()"
                    [partyKind]="partyKind()"
                    [paymentMethod]="paymentMethod()"
                    [refusal]="
                      refusalOn() === 'details' ? refusalMessage() : null
                    "
                    [disabled]="saving()"
                    (fulfilmentChange)="setFulfilment($event)"
                    (pickupKeyChange)="pickupKey.set($event)"
                    (partyKindChange)="setPartyKind($event)"
                    (paymentChange)="setPayment($event)"
                  />
                </div>
              }
            </section>
          </div>

          @if (formFailure(); as message) {
            <p uiErrorText class="mt-6" role="alert">
              {{ message }}
            </p>
          }
        </div>

        <aside summary>
          <!-- The customer's own words first: read-only, their half of the
                 record. -->
          <section class="mb-6">
            <h2 class="mb-2 font-medium">{{ text.customerHeading }}</h2>
            <p class="text-sm">{{ wished(loaded) }}</p>
            <p class="text-sm text-ink-subtle">
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

          <!-- A moved price, and one already off the list: invisible in a
                 total, so said once at sign-off. -->
          @for (notice of priceNotices(); track notice) {
            <ui-warning-note class="mt-4">{{ notice }}</ui-warning-note>
          }

          <!-- The change note, quoted in the mail, just above the save. -->
          <div class="mt-6">
            <label uiFieldLabel for="adjust-note">{{ names.changeNote }}</label>
            <textarea
              uiInput
              id="adjust-note"
              rows="3"
              class="w-full"
              [attr.maxlength]="noteMax"
              [attr.aria-invalid]="noteMissing() || null"
              [disabled]="saving()"
              [value]="note()"
              (input)="note.set($any($event.target).value)"
            ></textarea>
            <p uiHint class="mt-1">{{ text.noteHint }}</p>
            @if (noteMissing()) {
              <p uiErrorText class="mt-1" role="alert">
                {{ text.noteRequired }}
              </p>
            } @else if (noteFailure(); as message) {
              <!-- "Nothing changed" names no field, so it reads beside the
                     save. -->
              <p uiErrorText class="mt-1" role="alert">
                {{ message }}
              </p>
            }
          </div>

          <!-- Off by default (FR-NOTIF-03): the following move's mail carries
                 the news; this is for a change with none. -->
          <label uiTickLabel class="mt-4">
            <input
              uiCheckbox
              type="checkbox"
              [disabled]="saving()"
              [checked]="notify()"
              (change)="notify.set($any($event.target).checked)"
            />
            <span>
              {{ text.notify }}
              <span uiHint>
                {{ text.notifyHint }}
              </span>
            </span>
          </label>

          <button
            uiButton
            type="button"
            class="mt-5 w-full"
            [disabled]="saving()"
            (click)="save()"
          >
            {{ text.save }}
          </button>
          <a
            uiButton
            variant="secondary"
            class="mt-3 w-full"
            [routerLink]="['/admin/orders', reference()]"
          >
            {{ text.cancel }}
          </a>
        </aside>
      </ui-summary-layout>
    } @else if (missing()) {
      <p class="text-ink-subtle">{{ ordersText.notFound }}</p>
      <a uiButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ detailText.back }}
      </a>
    } @else if (loadFailed()) {
      <p class="text-ink-subtle" role="alert">{{ ordersText.loadError }}</p>
      <a uiButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ detailText.back }}
      </a>
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="8" />
    }
  `,
})
export class AdminOrderAdjustPage implements FieldAttempt {
  private readonly tax = useTaxStatement();
  private readonly api = inject(AdminOrdersService);
  private readonly ownership = inject(OwnershipService);
  private readonly tiersApi = inject(TiersService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly catalogConfig = inject(CATALOG_CONFIG);
  protected readonly phoneInput = this.config.phoneInput;
  private readonly currency = moneyFormat(this.config);

  protected readonly text = inject(ADMIN_TEXT).orders.adjust;
  protected readonly detailText = inject(ADMIN_TEXT).orders.detail;
  protected readonly ordersText = inject(ADMIN_TEXT).orders;
  private readonly changeText = inject(ADMIN_TEXT).orders.changes;
  protected readonly sharedText = inject(SHARED_TEXT);
  protected readonly names = this.sharedText.order;
  protected readonly fields = staffFields(
    this.sharedText.fields,
    inject(ADMIN_TEXT).fields,
  );
  private readonly payments = this.ordersText.paymentMethods;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  /** Whether an external system answers orders (FR-ADM-10): then nothing is
   * offered. */
  protected readonly locked = computed(() => this.ownership.owns('orders'));
  protected readonly locations = this.config.pickup?.locations ?? [];
  protected readonly billingEnabled = this.config.billingAddressEnabled;
  protected readonly noteMax = ORDER_ADJUSTMENT_NOTE_MAX;
  protected readonly itemsPanelId = 'adjust-items';
  protected readonly detailsPanelId = 'adjust-details';
  /** Both open: an adjustment starts by reading. */
  protected readonly itemsOpen = signal(true);
  protected readonly detailsOpen = signal(true);

  readonly reference = input.required<string>();

  /** A company is a party with a registration number; the switch only asks it.
   * */
  protected readonly partyKind = signal<PartyKind>('company');
  protected readonly fulfilmentMethod = signal<'delivery' | 'pickup'>(
    'delivery',
  );

  private readonly countries = this.config.address?.countries;
  private readonly addressRules = injectAddressRules();
  private readonly model = signal<AdjustAnswers>({
    party: { personName: '', companyName: '', companyId: '' },
    contact: { name: '', email: '', phone: '' },
    delivery: blankAddress(this.countries),
    billing: blankAddress(this.countries),
  });

  /** Party, contact and addresses, held to checkout's rules: correcting must
   * not introduce a typo. */
  protected readonly form = form(
    this.model,
    (answers) => {
      const { party, contact } = answers;
      // The hidden branch keeps its value for switching back, and is never read
      // (`partyValue`).
      hidden(party.personName, { when: () => this.partyKind() !== 'person' });
      required(party.personName, { message: this.fields.name.required });
      hidden(party.companyName, {
        when: () => this.partyKind() !== 'company',
      });
      required(party.companyName, {
        message: this.fields.companyName.required,
      });
      hidden(party.companyId, { when: () => this.partyKind() !== 'company' });
      required(party.companyId, { message: this.fields.companyId.required });
      companyIdFormat(
        party.companyId,
        this.config.companyIdInput?.formats,
        this.fields.companyId.format,
      );

      required(contact.name, { message: this.fields.name.required });
      required(contact.email, { message: this.fields.email.required });
      emailAddress(contact.email, this.fields.email.invalid);
      required(contact.phone, { message: this.fields.phone.required });
      completeMask(
        contact.phone,
        this.config.phoneInput?.mask,
        this.fields.phone.incomplete,
      );

      hidden(answers.delivery, {
        when: () => this.fulfilmentMethod() !== 'delivery',
      });
      apply(answers.delivery, this.addressRules);
      hidden(answers.billing, { when: () => !this.billingEnabled });
      apply(answers.billing, this.addressRules);
    },
    { name: 'order-adjust' },
  );
  protected readonly delivery = new AddressForm(
    this.form.delivery,
    this.countries,
  );
  protected readonly billing = new AddressForm(
    this.form.billing,
    this.countries,
  );

  readonly attempted = computed(() => submitAttempt(this.form)());

  /** Each kind's last method, so a switch to a company and back restores the
   * method rather than leaving a person on transfer. */
  private readonly rememberedPayment: Record<PartyKind, PaymentMethod> = {
    person: 'cash',
    company: 'bank-transfer',
  };

  protected setPayment(method: PaymentMethod): void {
    this.paymentMethod.set(method);
    this.rememberedPayment[this.partyKind()] = method;
  }

  protected setPartyKind(kind: PartyKind): void {
    if (kind !== this.partyKind()) {
      this.rememberedPayment[this.partyKind()] = this.paymentMethod();
      this.paymentMethod.set(this.rememberedPayment[kind]);
    }
    this.partyKind.set(kind);
  }

  private partyValue(): { name: string; registrationId: string | null } {
    const { personName, companyName, companyId } = this.model().party;
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
  protected readonly pickupKey = signal<string | null>(null);
  protected readonly paymentMethod = signal<PaymentMethod>('bank-transfer');
  protected readonly tierKey = signal<string | null>(null);
  /** Gives added lines their own identity, even for a product re-added. */
  private added = 0;
  protected readonly note = signal('');
  /** Off by default: the following move carries the news. */
  protected readonly notify = signal(false);
  protected readonly saving = signal(false);
  protected readonly failed = signal<string | null>(null);
  /** A refusal about the save, said under the note; the rest sit beside their
   * fields. */
  private readonly failedAtNote = signal(false);
  protected readonly formFailure = computed(() =>
    this.failedAtNote() ? null : this.failed(),
  );
  protected readonly noteFailure = computed(() =>
    this.failedAtNote() ? this.failed() : null,
  );
  protected readonly noteMissing = signal(false);

  constructor() {
    void this.ownership.load();
    usePageSeo({ name: () => this.title(), noindex: true });

    // Seeded once from the version on file: untouched saves unchanged.
    effect(() => {
      const order = this.order();
      if (!order) return;
      untracked(() => this.seed(order));
    });
  }

  protected title(): string {
    return fillText(this.text.page.title, { reference: this.reference() });
  }

  /** The fold's answers in the order's shape, read by the body and by the
   * proposed order alike. */
  private readonly details = computed(() => {
    const contact = this.model().contact;
    const delivery = this.fulfilmentMethod() === 'delivery';
    return {
      contact: {
        name: contact.name.trim(),
        email: contact.email.trim(),
        // The field holds the national part; the country code is the
        // deployment's.
        phone: canonicalPhone(contact.phone, this.config.phoneInput),
      },
      party: this.partyValue(),
      fulfilmentMethod: this.fulfilmentMethod(),
      deliveryAddress: delivery ? this.delivery.value() : null,
      pickupLocationKey: delivery ? null : this.pickupKey(),
      billingAddress: this.billingEnabled ? this.billing.value() : null,
      paymentMethod: this.paymentMethod(),
    };
  });

  /** What is priced and then written; null until the order loads. */
  private readonly body = computed<OrderAdjustment | null>(() => {
    const order = this.order();
    if (!order) return null;
    return {
      lines: this.lines().map((line) => ({
        slug: line.slug,
        pieces: line.pieces,
        unit: line.unit,
        note: line.note,
        priceMinor: draftPrice(line, this.currency),
      })),
      ...this.details(),
      tierKey: this.tierKey(),
      note: this.note().trim() || null,
      notify: this.notify(),
      basedOnRevision: order.revisionNumber,
    } as OrderAdjustment;
  });

  private readonly settledBody = debounced(this.body, PREVIEW_DEBOUNCE_MS);

  /** The server's pricing. A refusal is not an error: the save's rule, shown
   * early. */
  private readonly previewed = resource({
    // Not priced while owned elsewhere: the route is refused.
    params: () => (this.locked() ? null : this.settledBody()),
    // The priced draft travels back: a field is filled only where it asked in
    // that draft, so a superseded answer cannot write a list nobody chose.
    loader: async ({ params }) =>
      params
        ? {
            asked: params,
            answer: await this.api.previewAdjustment(this.reference(), params),
          }
        : null,
  });

  /** The last good pricing, **kept across the next**: a plain `resource` blanks
   * while reloading, which flickered every pause in typing. A refusal keeps it
   * too unless it is about pricing: a half-typed number does not make the lines
   * unknowable. */
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

  /** A rule broken on the form, kept as long as it is broken. */
  protected readonly refusal = computed<AdjustmentRefusal | null>(() => {
    const answer = this.previewed.hasValue()
      ? (this.previewed.value()?.answer ?? null)
      : null;
    return answer && !answer.ok ? answer.code : null;
  });

  protected readonly refusalOn = computed<'lines' | 'details' | null>(() => {
    const code = this.refusal();
    return code ? REFUSAL_PART[code] : null;
  });

  protected readonly refusalMessage = computed(() => {
    const code = this.refusal();
    return code ? this.text.errors[code] : '';
  });

  protected lineCount(): string {
    return fillText(this.adminText.countSuffix, { count: this.lines().length });
  }

  /** The draft with the server's figures, by slug, so a moved line's figures
   * follow it at once. */
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
        quantityLabel: answer
          ? customerQuantity(answer, this.sharedText, this.currency)
          : '',
        note: line.note,
        totalLabel: answer
          ? formatMoneyMinor(answer.lineTotalMinor, this.currency)
          : '',
        taxLabel: answer ? this.tax.line(answer.taxRate) : '',
        flags: answer?.flags ?? [],
        offList: answer ? offList(answer) : false,
      };
    });
  });

  /** The list's price written into a waiting field, to edit rather than retype.
   * */
  private readonly carryAnswer = effect(() => {
    const answered = this.previewed.hasValue() ? this.previewed.value() : null;
    const preview =
      answered?.answer && answered.answer.ok ? answered.answer.preview : null;
    if (!answered || !preview) return;
    // Only the current draft's answer fills fields: an older one would write
    // yesterday's list.
    const current = answered.asked === untracked(this.settledBody);
    const answers = new Map(preview.lines.map((line) => [line.slug, line]));
    untracked(() =>
      this.lines.update((lines) => {
        let changed = false;
        const next = lines.map((line) => {
          const answer = answers.get(line.slug);
          if (!answer) return line;
          const fill = line.fromList && current;
          // Nothing waiting: the same object, so this does not feed itself a
          // new draft.
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

  /** The changes as the customer would read them: blocks from the form alone,
   * lines and totals once priced. */
  protected readonly changes = computed<OrderChange[]>(() => {
    const order = this.order();
    if (!order) return [];
    const preview = this.preview();
    const config = {
      address: this.config.address,
      phoneInput: this.config.phoneInput,
      locale: this.config.locale,
      currency: this.currency,
      boxUnits: this.catalogConfig.boxUnits,
    };
    const proposed = this.proposed(order, preview);
    return [
      ...(preview
        ? orderLineChanges(
            order,
            proposed,
            { ...this.changeText, total: this.names.total },
            this.sharedText,
            config,
          )
        : []),
      ...orderBlockChanges(
        order,
        proposed,
        staffBlockLabels(this.sharedText, this.ordersText, this.detailText),
        config,
      ),
    ];
  });

  /** Why the lines cannot be compared: the draft is unpriceable. Still loading
   * is `pricingLoading`. */
  protected readonly changesPending = computed(() =>
    !this.preview() && this.refusalOn() === 'lines'
      ? this.text.changes.pricingPending
      : null,
  );

  /** The first pricing is in flight: neither "no change" nor an error. */
  protected readonly pricingLoading = computed(
    () => !this.preview() && this.refusalOn() !== 'lines',
  );

  protected readonly priceNotices = computed<string[]>(() => {
    const order = this.order();
    const preview = this.preview();
    return order && preview
      ? priceNotices(order, preview, this.text.priceNotice, this.tierLabel())
      : [];
  });

  private tierLabel(): string {
    const key = this.tierKey();
    if (!key) return this.ordersText.tierDefault;
    return this.tiers().find((tier) => tier.key === key)?.label ?? key;
  }

  protected setPieces(index: number, pieces: number): void {
    this.lines.update((lines) =>
      lines.map((line, i) => (i === index ? { ...line, pieces } : line)),
    );
  }

  /** Typing wins over the pending list price. */
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

  /** Reorders lines: no change to the order or the mail, but it spares removing
   * and re-adding, which loses the price. */
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
        // Its own identity, so a removal above does not hand its row to a
        // neighbour.
        key: `added-${++this.added}-${item.slug}`,
        slug: item.slug,
        name: item.name,
        pieces: 1,
        // No customer reading, and priced by the list.
        unit: null,
        note: null,
        // Filled in by the server's answer.
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

  /** Takes every price from the chosen list (FR-CART-09), for a provisional
   * order. Each line is marked, not emptied, so the answer fills an editable
   * field. */
  protected repriceFromList(): void {
    this.lines.update((lines) =>
      lines.map((line) => ({ ...line, fromList: true })),
    );
  }

  /** Ended: changing it records what the shop did, but requeues nothing and
   * tells nobody. */
  protected ended(order: AdminOrderDetail): boolean {
    return (
      order.status === 'completed' ||
      order.status === 'declined' ||
      order.status === 'cancelled'
    );
  }

  /** Named as the asked-for day: a bare date reads as the order date. */
  protected wished(order: AdminOrderDetail): string {
    return fillText(this.text.wished, { date: this.wish(order) });
  }

  private wish(order: AdminOrderDetail): string {
    if (!order.preferredDate) return this.detailText.whenAny;
    return new Date(order.preferredDate).toLocaleDateString(
      this.config.locale,
      { dateStyle: 'long' },
    );
  }

  protected async save(): Promise<void> {
    const body = this.body();
    if (!body || this.saving()) return;

    // The contract refuses an empty order: said in the screen's words. An order
    // not filled is declined, not emptied.
    if (body.lines.length === 0) {
      this.failedAtNote.set(false);
      this.failed.set(this.text.lines.empty);
      return;
    }

    // Checkout's rules: correcting must not introduce a typo. Addresses keep
    // their own attempt (AddressFields).
    for (const sent of [this.form, this.form.delivery, this.form.billing]) {
      submitAttempt(sent).set(true);
    }
    if (this.form().invalid()) {
      // Folded, the fields would say so to nobody.
      this.detailsOpen.set(true);
      return;
    }

    // Required here, optional in the contract: the manager knows what was
    // agreed.
    if (!body.note) {
      this.noteMissing.set(true);
      return;
    }
    this.noteMissing.set(false);

    const go = await this.confirm.ask({
      ...confirmRequest(this.text.confirm),
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

  /** The proposed order, for the block comparison. */
  private proposed(
    order: AdminOrderDetail,
    preview: OrderAdjustmentPreview | null,
  ): AdminOrderDetail {
    const { pickupLocationKey, billingAddress, ...details } = this.details();
    const pickup = this.locations.find(
      (location) => location.key === pickupLocationKey,
    );
    return {
      ...order,
      ...details,
      pickup: pickup
        ? { key: pickup.key, name: pickup.name, address: pickup.address }
        : null,
      // Without invoice addresses the server carries the old one forward, so
      // this does too.
      billingAddress: this.billingEnabled
        ? billingAddress
        : order.billingAddress,
      // Unpriced, the order's figures stand in; the block comparison never
      // reads them.
      deliveryZone: preview?.deliveryZone ?? order.deliveryZone,
      lines: preview?.lines ?? order.lines,
      totalMinor: preview?.totalMinor ?? order.totalMinor,
      shipment: preview?.shipment ?? order.shipment,
    };
  }

  private seed(order: AdminOrderDetail): void {
    this.lines.set(draftLines(order, this.currency));
    // A registration number makes a company; the switch is read back from it.
    const company = order.party.registrationId !== null;
    const kind = company ? 'company' : 'person';
    // A kind no longer sold to opens on one that is, that half empty.
    this.setPartyKind(
      this.config.customerTypes.includes(kind)
        ? kind
        : this.config.customerTypes[0],
    );
    this.model.update((answers) => ({
      ...answers,
      party: {
        personName: company ? '' : order.party.name,
        companyName: company ? order.party.name : '',
        companyId: order.party.registrationId ?? '',
      },
      contact: {
        name: order.contact.name,
        email: order.contact.email,
        // The field holds the national part; the prefix is shown, not typed.
        phone: typedPhone(order.contact.phone, this.config.phoneInput),
      },
    }));
    this.fulfilmentMethod.set(order.fulfilmentMethod);
    this.pickupKey.set(order.pickup?.key ?? this.locations[0]?.key ?? null);
    this.setPayment(order.paymentMethod);
    // An older company order on cash or card is corrected, and the change list
    // says so.
    const offered = paymentOptions(this.partyKind(), this.payments);
    if (!offered.some((option) => option.value === this.paymentMethod())) {
      this.setPayment('bank-transfer');
    }
    this.tierKey.set(order.tierKey);
    // A snapshot has no label, and none is drawn.
    if (order.deliveryAddress) {
      this.delivery.fill({ ...order.deliveryAddress, label: null });
    }
    if (order.billingAddress) {
      this.billing.fill({ ...order.billingAddress, label: null });
    }
  }
}
