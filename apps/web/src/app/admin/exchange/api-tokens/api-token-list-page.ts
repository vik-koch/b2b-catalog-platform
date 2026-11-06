import { ADMIN_EXCHANGE_TEXT } from '../exchange-text';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { form, maxLength, required, validate } from '@angular/forms/signals';
import {
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_SCOPES,
  ApiTokenScope,
  fillText,
} from '@b2b-catalog-platform/shared/platform';
import {
  ApiToken,
  CreatedApiToken,
} from '@b2b-catalog-platform/shared/admin/exchange';
import { ADMIN_TEXT } from '../../../platform/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { delayedLoading } from '../../../platform/delayed-loading';
import { usePageSeo } from '../../../platform/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { filled } from '../../../platform/field-rules';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { RecordFields } from '@b2b-catalog-platform/ui/lists/record-fields';
import { RecordFormActions } from '@b2b-catalog-platform/ui/lists/record-form-actions';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { adminMomentFormat } from '../../platform/dates/admin-date';
import { ApiTokensService } from './api-tokens.service';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { circleSlashIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-slash';
import { copyIcon } from '@b2b-catalog-platform/ui/icons/glyphs/copy';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';
import { SaveButton } from '../../platform/ui/save-button';
import { CancelButton } from '../../platform/ui/cancel-button';

/** The form's rows, in the order a deployment's exchange grows. */
const SCOPE_AREAS = ['catalog', 'customers', 'orders'] as const;
type ScopeArea = (typeof SCOPE_AREAS)[number];

/** A total map, so a new scope cannot compile without a square to sit in. */
const SCOPE_PLACE: Record<
  ApiTokenScope,
  { area: ScopeArea; kind: 'read' | 'submit' }
> = {
  'catalog-sync': { area: 'catalog', kind: 'submit' },
  'customer-read': { area: 'customers', kind: 'read' },
  'customer-sync': { area: 'customers', kind: 'submit' },
  'order-read': { area: 'orders', kind: 'read' },
  'order-sync': { area: 'orders', kind: 'submit' },
};

/** One row per area, reading then writing; null where a capability does not
 * exist, as nothing reads the catalog outward. */
const SCOPE_ROWS: readonly {
  area: ScopeArea;
  cells: readonly (ApiTokenScope | null)[];
}[] = SCOPE_AREAS.map((area) => ({
  area,
  cells: (['read', 'submit'] as const).map(
    (kind) =>
      API_TOKEN_SCOPES.find(
        (scope) =>
          SCOPE_PLACE[scope].area === area && SCOPE_PLACE[scope].kind === kind,
      ) ?? null,
  ),
}));

/**
 * Machine tokens (NFR-SEC-09), edited inline like tiers. A new value is shown
 * once, in its own panel. Revoked rows stay listed: old runs name them.
 */
@Component({
  selector: 'app-api-token-list-page',
  imports: [
    CancelButton,
    SaveButton,
    PageHeader,
    FORM_FIELDS,
    Notice,
    Button,
    IconButton,
    Icon,
    Input,
    Checkbox,
    Skeleton,
    StatusBadge,
    RecordRow,
    RecordFields,
    RecordFormActions,
    ErrorText,
  ],
  template: `
    <ui-page-header [title]="text.page.title" [intro]="text.page.intro">
      <button
        uiButton
        type="button"
        class="gap-2"
        [disabled]="adding()"
        (click)="startAdd()"
      >
        <ui-icon [glyph]="plusIcon" class="size-4" />
        {{ text.add }}
      </button>
    </ui-page-header>

    <div class="max-w-3xl">
      <!-- Stays until dismissed: leaving loses the credential, not a step. -->
      @if (created(); as token) {
        <div uiNotice tone="warning" class="mb-6" role="status">
          <p class="font-medium">
            {{ fill(text.createdHeading, token.name) }}
          </p>
          <p class="mt-1">{{ text.createdOnce }}</p>
          <div class="mt-3 flex items-center gap-2">
            <code
              class="min-w-0 flex-1 overflow-x-auto rounded-sm border
                     border-warning-edge bg-white px-2 py-1.5 font-mono
                     text-sm break-all"
              >{{ token.token }}</code
            >
            <button
              uiButton
              variant="secondary"
              size="sm"
              type="button"
              class="shrink-0 gap-2"
              (click)="copy(token.token)"
            >
              <ui-icon
                [glyph]="copied() ? circleCheckIcon : copyIcon"
                class="size-4"
              />
              {{ copied() ? text.copied : text.copy }}
            </button>
          </div>
          <button
            uiButton
            variant="secondary"
            size="sm"
            type="button"
            class="mt-3"
            (click)="dismiss()"
          >
            {{ actionText.done }}
          </button>
        </div>
      }

      @if (tokens.error()) {
        <p class="text-ink-subtle" role="alert">{{ adminText.loadError }}</p>
      } @else if (tokens.hasValue()) {
        <div class="divide-y divide-edge border-y border-edge">
          @for (token of tokens.value(); track token.id) {
            <div class="py-3">
              <ui-record-row [stackMeta]="true">
                <span
                  class="font-medium"
                  [class]="
                    token.revokedAt ? 'text-ink-subtle line-through' : ''
                  "
                  >{{ token.name }}</span
                >
                <code class="font-mono text-sm text-ink-subtle"
                  >{{ token.prefix }}…</code
                >
                <ng-container recordBadge>
                  @if (token.revokedAt) {
                    <span uiStatusBadge tone="danger">{{ text.revoked }}</span>
                  } @else {
                    <span uiStatusBadge tone="ok">{{ text.active }}</span>
                  }
                </ng-container>
                <ng-container recordMeta>
                  <span>{{ scopeList(token.scopes) }}</span>
                  <span>{{ createdLine(token) }}</span>
                  <span>{{ usedLine(token) }}</span>
                </ng-container>
                <ng-container recordActions>
                  @if (!token.revokedAt) {
                    <button
                      uiIconButton
                      variant="danger"
                      type="button"
                      [attr.aria-label]="text.revokeAria"
                      [disabled]="busy()"
                      (click)="revoke(token)"
                    >
                      <ui-icon [glyph]="circleSlashIcon" />
                    </button>
                  }
                </ng-container>
              </ui-record-row>
              @if (rowError() === token.id) {
                <p uiErrorText class="mt-2" role="alert">
                  {{ text.revokeError }}
                </p>
              }
            </div>
          }

          @if (adding()) {
            <div class="py-3">
              <!-- No expiry: revocation is the control. -->
              <form uiRecordFields [formRoot]="form" (submit)="save()">
                <ui-field
                  [field]="form.name"
                  [label]="text.name"
                  controlId="api-token-name"
                >
                  <input
                    uiInput
                    size="sm"
                    class="w-full"
                    autocomplete="off"
                    [placeholder]="text.namePlaceholder"
                    [formField]="form.name"
                  />
                </ui-field>
                <!-- One token for several capabilities, laid out as the grid
                     they form; a blank cell is one that does not exist. -->
                <ui-field-group [field]="form.scopes" [label]="text.scope">
                  <!-- Columns as wide as their heading, so a tick sits by
                       its words. -->
                  <div
                    class="grid grid-cols-[auto_auto_auto] justify-start
                           items-center gap-x-8 gap-y-1.5 text-sm"
                  >
                    <span aria-hidden="true"></span>
                    <span class="justify-self-center text-xs text-ink-subtle">
                      {{ text.scopeKind.read }}
                    </span>
                    <span class="justify-self-center text-xs text-ink-subtle">
                      {{ text.scopeKind.submit }}
                    </span>
                    @for (row of scopeRows; track row.area) {
                      <span>{{ text.scopeArea[row.area] }}</span>
                      @for (cell of row.cells; track $index) {
                        <span class="justify-self-center">
                          @if (cell; as scope) {
                            <input
                              type="checkbox"
                              uiCheckbox
                              [checked]="draft().scopes.includes(scope)"
                              [attr.aria-label]="scopeLabel(scope)"
                              (change)="toggleScope(scope)"
                            />
                          }
                        </span>
                      }
                    }
                  </div>
                </ui-field-group>
                <p class="text-xs text-ink-subtle sm:col-span-full">
                  {{ text.scopeHint }}
                </p>
                <div uiRecordFormActions>
                  <button
                    uiButton
                    appSaveButton
                    size="sm"
                    type="submit"
                    [saving]="busy()"
                  >
                    {{ text.create }}
                  </button>
                  <button
                    uiButton
                    variant="secondary"
                    appCancelButton
                    size="sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="cancel()"
                  >
                    {{ actionText.cancel }}
                  </button>
                </div>
                @if (formError()) {
                  <p uiErrorText class="sm:col-span-full" role="alert">
                    {{ formError() }}
                  </p>
                }
              </form>
            </div>
          } @else if (tokens.value().length === 0) {
            <p class="py-3 text-sm text-ink-subtle">{{ text.empty }}</p>
          }
        </div>
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="3" />
      }
    </div>
  `,
})
export class ApiTokenListPage {
  protected readonly circleCheckIcon = circleCheckIcon;
  protected readonly circleSlashIcon = circleSlashIcon;
  protected readonly copyIcon = copyIcon;
  protected readonly plusIcon = plusIcon;
  private readonly service = inject(ApiTokensService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_EXCHANGE_TEXT).apiTokens;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;

  protected readonly scopeRows = SCOPE_ROWS;

  protected readonly tokens = resource({ loader: () => this.service.list() });
  protected readonly showSkeleton = delayedLoading(this.tokens.isLoading);

  protected readonly adding = signal(false);
  protected readonly draft = signal({
    name: '',
    scopes: [] as ApiTokenScope[],
  });
  protected readonly form = form(
    this.draft,
    (token) => {
      filled(token.name, this.text.nameRequired);
      maxLength(token.name, API_TOKEN_NAME_MAX_LENGTH);
      // `required` takes an empty list as given, so the count says it.
      required(token.scopes);
      validate(token.scopes, ({ value }) =>
        value().length === 0
          ? { kind: 'required', message: this.text.scopeRequired }
          : undefined,
      );
    },
    { name: 'api-token' },
  );
  protected readonly formError = signal<string | null>(null);
  /** The id of a row whose revoke was refused. */
  protected readonly rowError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly created = signal<CreatedApiToken | null>(null);
  protected readonly copied = signal(false);

  private readonly moment = computed(() => adminMomentFormat(this.locale));

  constructor() {
    usePageSeo({ name: () => this.text.page.title, noindex: true });
  }

  protected fill(template: string, value: string): string {
    return fillText(template, { name: value });
  }

  protected scopeLabel(scope: ApiTokenScope): string {
    return this.text.scopes[scope];
  }

  /** In declared order, so two tokens with the same grant read the same. */
  protected scopeList(scopes: readonly ApiTokenScope[]): string {
    return API_TOKEN_SCOPES.filter((scope) => scopes.includes(scope))
      .map((scope) => this.scopeLabel(scope))
      .join(', ');
  }

  protected toggleScope(scope: ApiTokenScope): void {
    this.form
      .scopes()
      .value.update((current) =>
        current.includes(scope)
          ? current.filter((s) => s !== scope)
          : [...current, scope],
      );
  }

  protected createdLine(token: ApiToken): string {
    return fillText(this.text.created, {
      date: this.moment().format(new Date(token.createdAt)),
      actor: token.createdBy ?? this.adminText.actorGone,
    });
  }

  /** A token nobody uses looks like a working one until this line says so. */
  protected usedLine(token: ApiToken): string {
    if (!token.lastUsedAt) return this.text.neverUsed;
    return fillText(this.text.lastUsed, {
      date: this.moment().format(new Date(token.lastUsedAt)),
    });
  }

  protected startAdd(): void {
    this.draft.set({ name: '', scopes: [] });
    submitAttempt(this.form).set(false);
    this.formError.set(null);
    this.adding.set(true);
  }

  protected cancel(): void {
    this.adding.set(false);
    this.formError.set(null);
  }

  protected dismiss(): void {
    this.created.set(null);
    this.copied.set(false);
  }

  protected async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(true);
    } catch {
      // Refused clipboard: the value is on screen and selectable.
    }
  }

  protected async save(): Promise<void> {
    if (this.busy() || this.form().invalid()) return;
    const name = this.draft().name.trim();
    const scopes = this.draft().scopes;

    this.busy.set(true);
    this.formError.set(null);
    try {
      const token = await this.service.create({ name, scopes });
      this.created.set(token);
      this.copied.set(false);
      this.adding.set(false);
      this.tokens.reload();
    } catch {
      this.formError.set(this.text.createError);
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(token: ApiToken): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: this.text.revokeConfirm.heading,
      message: this.fill(this.text.revokeConfirm.message, token.name),
      warning: this.text.revokeConfirm.warning,
      confirmLabel: this.text.revokeConfirm.confirm,
      cancelLabel: this.text.revokeConfirm.cancel ?? this.actionText.cancel,
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    this.busy.set(true);
    this.rowError.set(null);
    try {
      const result = await this.service.revoke(token.id);
      if (!result.ok) {
        this.rowError.set(token.id);
      }
      this.tokens.reload();
    } catch {
      this.rowError.set(token.id);
    } finally {
      this.busy.set(false);
    }
  }
}
