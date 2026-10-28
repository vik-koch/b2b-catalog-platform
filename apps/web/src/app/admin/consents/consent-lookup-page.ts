import {
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { form, hidden } from '@angular/forms/signals';
import { Router } from '@angular/router';
import {
  CONSENT_WITHDRAWAL_NOTE_MAX,
  fillText,
} from '@b2b-catalog-platform/shared';
import {
  ConsentRecord,
  FindConsentsQuery,
} from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import {
  canonicalPhone,
  formatPhone,
  typedPhone,
} from '../../shared/core/contact-fields';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { completeMask, emailAddress } from '../../shared/core/field-rules';
import { usePageSeo } from '../../shared/core/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { Input } from '../../shared/ui/input';
import { PhoneInput } from '../../shared/ui/phone-input';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { adminDayFormat } from '../dates/admin-date';
import { ConsentRecordList } from './consent-record-list';
import { ConsentsService } from './consents.service';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

type SearchBy = 'email' | 'phone';

interface ConsentSearch {
  by: SearchBy;
  email: string;
  phone: string;
}

/**
 * Whose consents (NFR-LEGAL-09): an email address or a phone number in, the
 * records naming it out. The search lives in the address bar, so a result can
 * be reloaded, sent to a colleague, or come back to from an account it links.
 */
@Component({
  selector: 'app-consent-lookup-page',
  imports: [
    FORM_FIELDS,
    Button,
    Input,
    PhoneInput,
    Segmented,
    Skeleton,
    ConsentRecordList,
    PageTitle,
    ErrorText,
    PageIntro,
  ],
  template: `
    <div class="max-w-3xl">
      <h1 appPageTitle>{{ text.page.title }}</h1>
      @if (text.page.intro; as intro) {
        <p appPageIntro class="mt-2">{{ intro }}</p>
      }

      <form [formRoot]="form" class="mt-6 space-y-4" (submit)="search()">
        <app-segmented
          [options]="searchOptions"
          size="md"
          [formField]="form.by"
        />
        @if (searchBy() === 'email') {
          <app-field
            [field]="form.email"
            [label]="text.byEmail"
            controlId="email"
          >
            <input
              type="email"
              autocomplete="off"
              appInput
              class="w-full"
              [formField]="form.email"
            />
          </app-field>
        } @else {
          <app-field
            [field]="form.phone"
            [label]="text.byPhone"
            controlId="phone"
          >
            <app-phone-input
              [field]="form.phone"
              [phone]="phoneInput"
              autocomplete="off"
            />
          </app-field>
        }
        <button appButton type="submit">{{ text.search }}</button>
      </form>

      <div class="mt-8">
        @if (results.error()) {
          <p class="text-ink-subtle" role="alert">{{ text.loadError }}</p>
        } @else if (results.hasValue() && query(); as asked) {
          @if (withdrawError(); as message) {
            <p appErrorText class="mb-4" role="alert">{{ message }}</p>
          }
          @if (results.value().length > 0) {
            <app-consent-record-list
              [records]="results.value()"
              [withdrawable]="true"
              (withdraw)="withdraw($event)"
            />
          } @else {
            <p class="text-ink-subtle">{{ emptyLine(asked) }}</p>
          }
        } @else if (showSkeleton()) {
          <app-skeleton [lines]="4" />
        }
      </div>
    </div>
  `,
})
export class ConsentLookupPage {
  private readonly service = inject(ConsentsService);
  private readonly confirm = inject(ConfirmService);
  private readonly dayFormat = adminDayFormat(inject(DEPLOYMENT_CONFIG).locale);
  /** Why the last withdrawal was not saved, until the next one is tried. */
  protected readonly withdrawError = signal<string | null>(null);
  private readonly router = inject(Router);
  protected readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;

  protected readonly text = inject(ADMIN_TEXT).consents;
  private readonly adminText = inject(ADMIN_TEXT);
  private readonly fields = inject(ADMIN_TEXT).fields;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  /** From the query string, by input binding; absent arrives as undefined. */
  readonly email = input<string | undefined>();
  readonly phone = input<string | undefined>();

  protected readonly searchOptions: SegmentOption<SearchBy>[] = [
    { value: 'email', label: this.text.byEmail },
    { value: 'phone', label: this.text.byPhone },
  ];
  private readonly model = signal<ConsentSearch>({
    by: 'email',
    email: '',
    phone: '',
  });
  protected readonly form = form(
    this.model,
    (search) => {
      // Format only: an empty box searches for nothing, which needs no
      // sentence. The box not shown counts for nothing.
      hidden(search.email, {
        when: ({ valueOf }) => valueOf(search.by) !== 'email',
      });
      hidden(search.phone, {
        when: ({ valueOf }) => valueOf(search.by) !== 'phone',
      });
      emailAddress(search.email, this.fields.email.invalid);
      completeMask(
        search.phone,
        this.phoneInput?.mask,
        this.fields.phone.incomplete,
      );
    },
    { name: 'consent-lookup' },
  );
  protected readonly searchBy = computed(() => this.model().by);

  /** What the address bar asks for: one of the two, never both. */
  protected readonly query = computed<FindConsentsQuery | null>(() => {
    const email = this.email()?.trim();
    if (email) return { email };
    const phone = this.phone()?.trim();
    return phone ? { phone } : null;
  });

  protected readonly results = resource({
    params: () => this.query() ?? undefined,
    loader: ({ params }) => this.service.find(params),
  });
  protected readonly showSkeleton = delayedLoading(this.results.isLoading);

  constructor() {
    usePageSeo({ name: () => this.text.page.title });
    // A search opened from a link fills the form it would have been typed
    // into, so changing it starts from what is shown.
    effect(() => {
      const query = this.query();
      if (!query) return;
      this.model.update((search) =>
        query.phone
          ? {
              ...search,
              by: 'phone',
              phone: typedPhone(query.phone, this.phoneInput),
            }
          : { ...search, by: 'email', email: query.email ?? '' },
      );
    });
  }

  protected search(): void {
    const { by, email, phone } = this.model();
    if (!(by === 'email' ? email : phone).trim()) return;
    if (this.form().invalid()) return;
    const queryParams =
      by === 'email'
        ? { email: email.trim().toLowerCase() }
        : { phone: canonicalPhone(phone, this.phoneInput) };
    void this.router.navigate([], { queryParams });
  }

  /**
   * A withdrawal that reached the shop from outside, entered against its
   * record. Asked first, since it cannot be taken back; the note says how it
   * arrived, which is what an inspection asks next.
   */
  protected async withdraw(record: ConsentRecord): Promise<void> {
    this.withdrawError.set(null);
    const holder =
      record.email ?? formatPhone(record.phone, this.phoneInput) ?? '';
    const answer = await this.confirm.askDetailed({
      heading: this.text.withdrawConfirm.heading,
      message: fillText(this.text.withdrawConfirm.message, {
        holder,
        date: this.dayFormat.format(new Date(record.givenAt)),
      }),
      // The platform holds the record, not the inquiry: that is a mail in
      // the shop's inbox, and only a person can delete it there.
      warning: this.text.withdrawConfirm.warning,
      confirmLabel: this.text.withdrawConfirm.confirm,
      cancelLabel: this.text.withdrawConfirm.cancel ?? this.actionText.cancel,
      confirmVariant: 'danger',
      reasonLabel: this.text.withdrawNote,
      reasonMaxLength: CONSENT_WITHDRAWAL_NOTE_MAX,
      // Worth having, not worth blocking a withdrawal over.
      reasonRequired: false,
    });
    if (!answer) return;

    try {
      const result = await this.service.withdraw(
        record.id,
        answer.reason ?? '',
      );
      if (result.ok) {
        this.results.update((list) =>
          list?.map((r) => (r.id === result.record.id ? result.record : r)),
        );
        return;
      }
      this.withdrawError.set(this.text.withdrawErrors[result.code]);
      // Whatever changed under the list, show it as it now stands.
      this.results.reload();
    } catch {
      this.withdrawError.set(this.text.withdrawError);
    }
  }

  protected emptyLine(query: FindConsentsQuery): string {
    const shown = query.email ?? formatPhone(query.phone, this.phoneInput);
    return fillText(this.text.empty, { query: shown });
  }
}
