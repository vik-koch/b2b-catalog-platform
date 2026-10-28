import { Component, computed, inject, resource, signal } from '@angular/core';
import { form, maxLength, required, validate } from '@angular/forms/signals';
import {
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_SCOPES,
  ApiTokenScope,
} from '@b2b-catalog-platform/shared';
import { ApiToken, CreatedApiToken } from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { usePageSeo } from '../../shared/core/page-seo';
import { Button } from '../../shared/ui/button';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { FieldLabel } from '../../shared/ui/field-label';
import { filled } from '../../shared/core/field-rules';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { submitAttempt } from '../../shared/ui/submit-attempt';
import { IconButton } from '../../shared/ui/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Checkbox } from '../../shared/ui/checkbox';
import { Input } from '../../shared/ui/input';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';
import { RecordFields } from '../../shared/ui/record-fields';
import { RecordFormActions } from '../../shared/ui/record-form-actions';
import { RecordRow } from '../../shared/ui/record-row';
import { adminMomentFormat } from '../dates/admin-date';
import { ApiTokensService } from './api-tokens.service';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { ErrorText } from '../../shared/ui/error-text';
import { Notice } from '../../shared/ui/notice';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { circleSlashIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-slash';
import { copyIcon } from '@b2b-catalog-platform/ui/icons/glyphs/copy';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { saveIcon } from '@b2b-catalog-platform/ui/icons/glyphs/save';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { PageHeader } from '../../shared/ui/page-header';

/**
 * What a new token starts out allowed to do: **nothing**, so a capability is
 * only ever on the token because somebody ticked it. The exception is a
 * deployment with a single capability to give, where there is no choice to
 * make and an empty form would be asking the operator to confirm the only
 * answer.
 */
function defaultScopes(): ApiTokenScope[] {
  // Widened deliberately: `API_TOKEN_SCOPES` is `as const`, so its length is a
  // literal type and the comparison would be a compile error the day a second
  // capability is added — exactly the day this branch starts to matter.
  const available: readonly ApiTokenScope[] = API_TOKEN_SCOPES;
  return available.length === 1 ? [...available] : [];
}

/**
 * The areas a capability can be about, in the order the form lists them — the
 * catalog first because it is where a deployment's exchange starts, then the
 * customers it sells to, then the orders they place.
 */
const SCOPE_AREAS = ['catalog', 'customers', 'orders'] as const;
type ScopeArea = (typeof SCOPE_AREAS)[number];

/**
 * Where each capability sits in that grid.
 *
 * A total map rather than a rule about how a scope is spelled: adding a
 * capability is a release (see `API_TOKEN_SCOPES`), and this is what makes the
 * compiler say so — a new scope with no square to sit in is a checkbox nobody
 * can tick, which would be invisible in a screenshot and obvious to nobody.
 */
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

/**
 * One row per area, reading then writing. A null cell is a capability that
 * does not exist: the catalog travels inward only, so there is nothing to
 * grant a reader of it, and an empty square says that better than a row with
 * one tick in a column of two.
 */
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
 * Machine tokens (NFR-SEC-09) — the credentials automated clients present
 * instead of signing in.
 *
 * A token is a name and a set of capabilities, so it edits like a tier does:
 * no editor screen, an inline form, rows in place. The one thing this screen has that no
 * other admin list has is a value it can never show again, which is why the
 * created token gets a panel of its own rather than a line in the list — an
 * admin who scrolls past it has lost it.
 *
 * Revoked rows stay listed. They are what a sync run made months ago points
 * at, and a list that forgets them cannot answer "which credential did this".
 */
@Component({
  selector: 'app-api-token-list-page',
  imports: [
    PageHeader,
    FORM_FIELDS,
    Notice,
    Button,
    IconButton,
    Icon,
    Input,
    FieldLabel,
    Checkbox,
    Skeleton,
    StatusBadge,
    RecordRow,
    RecordFields,
    RecordFormActions,
    ErrorText,
  ],
  template: `
    <app-page-header [title]="text.page.title" [intro]="text.page.intro">
      <button
        appButton
        type="button"
        class="gap-2"
        [disabled]="adding()"
        (click)="startAdd()"
      >
        <app-icon [glyph]="plusIcon" class="size-4" />
        {{ text.add }}
      </button>
    </app-page-header>

    <div class="max-w-3xl">
      <!-- The value, once. Amber rather than a plain card: this is the only
           panel in the admin that is worth interrupting for, and it stays put
           until it is dismissed — an admin who navigates away has not lost a
           step, they have lost the credential. -->
      @if (created(); as token) {
        <div appNotice tone="warning" class="mb-6" role="status">
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
              appButton
              variant="secondary"
              size="sm"
              type="button"
              class="shrink-0 gap-2"
              (click)="copy(token.token)"
            >
              <app-icon
                [glyph]="copied() ? circleCheckIcon : copyIcon"
                class="size-4"
              />
              {{ copied() ? text.copied : text.copy }}
            </button>
          </div>
          <button
            appButton
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
              <!-- Three sentences, not three figures: what this credential
                   may do, who issued it when, and whether anything has used
                   it. Each on its own line. -->
              <app-record-row [stackMeta]="true">
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
                    <span appStatusBadge tone="danger">{{ text.revoked }}</span>
                  } @else {
                    <span appStatusBadge tone="ok">{{ text.active }}</span>
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
                      appIconButton
                      variant="danger"
                      type="button"
                      [attr.aria-label]="text.revokeAria"
                      [disabled]="busy()"
                      (click)="revoke(token)"
                    >
                      <app-icon [glyph]="circleSlashIcon" />
                    </button>
                  }
                </ng-container>
              </app-record-row>
              @if (rowError() === token.id) {
                <p appErrorText class="mt-2" role="alert">
                  {{ text.revokeError }}
                </p>
              }
            </div>
          }

          @if (adding()) {
            <div class="py-3">
              <!-- Name and capabilities, and nothing else: a token has no
                   expiry to set (revocation is the control) and no value to
                   choose. -->
              <form appRecordFields [formRoot]="form" (submit)="save()">
                <app-field
                  [field]="form.name"
                  [label]="text.name"
                  controlId="api-token-name"
                >
                  <input
                    appInput
                    size="sm"
                    class="w-full"
                    autocomplete="off"
                    [placeholder]="text.namePlaceholder"
                    [formField]="form.name"
                  />
                </app-field>
                <!-- One token, however many capabilities: the automated
                     client a deployment runs is usually one process doing
                     several things, and two credentials for it would be two
                     things to rotate and two to mix up.

                     A tick apiece rather than a multi-select, which hides
                     what is not chosen — laid out as the grid the capabilities
                     actually form: an area per row, reading and writing as the
                     two columns. Reading first, because it is the lesser of
                     the two and the one a client is given while it is being
                     brought up. A blank cell is a capability that does not
                     exist rather than one left unticked: nothing reads the
                     catalog outward, so the exchange that receives it has no
                     read to grant.

                     While only one capability exists there is nothing to ask,
                     so it is stated instead; the ticks appear on their own
                     when a second one is added. -->
                @if (scopes.length > 1) {
                  <app-field-group [field]="form.scopes" [label]="text.scope">
                    <!-- Columns as wide as their heading, not as wide as the
                         form: a tick belongs beside the words that name it,
                         and two stretched columns put it halfway across the
                         screen from both. -->
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
                                appCheckbox
                                [checked]="draft().scopes.includes(scope)"
                                [attr.aria-label]="scopeLabel(scope)"
                                (change)="toggleScope(scope)"
                              />
                            }
                          </span>
                        }
                      }
                    </div>
                  </app-field-group>
                } @else {
                  <div>
                    <span appFieldLabel>{{ text.scope }}</span>
                    <p class="pt-1.5 text-sm">
                      {{ scopeList(draft().scopes) }}
                    </p>
                  </div>
                }
                <p class="text-xs text-ink-subtle sm:col-span-full">
                  {{ text.scopeHint }}
                </p>
                <div appRecordFormActions>
                  <button
                    appButton
                    size="sm"
                    type="submit"
                    class="gap-2"
                    [disabled]="busy()"
                  >
                    <app-icon [glyph]="saveIcon" class="size-4" />
                    {{ busy() ? actionText.saving : text.create }}
                  </button>
                  <button
                    appButton
                    variant="secondary"
                    size="sm"
                    type="button"
                    class="gap-2"
                    [disabled]="busy()"
                    (click)="cancel()"
                  >
                    <app-icon [glyph]="xIcon" class="size-4" />
                    {{ actionText.cancel }}
                  </button>
                </div>
                @if (formError()) {
                  <p appErrorText class="sm:col-span-full" role="alert">
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
        <app-skeleton [lines]="3" />
      }
    </div>
  `,
})
export class ApiTokenListPage {
  protected readonly circleCheckIcon = circleCheckIcon;
  protected readonly circleSlashIcon = circleSlashIcon;
  protected readonly copyIcon = copyIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly saveIcon = saveIcon;
  protected readonly xIcon = xIcon;
  private readonly service = inject(ApiTokensService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).apiTokens;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;

  /** Widened for the same reason `defaultScopes` widens: the template asks
   * how many there are. */
  protected readonly scopes: readonly ApiTokenScope[] = API_TOKEN_SCOPES;
  protected readonly scopeRows = SCOPE_ROWS;

  protected readonly tokens = resource({ loader: () => this.service.list() });
  protected readonly showSkeleton = delayedLoading(this.tokens.isLoading);

  protected readonly adding = signal(false);
  protected readonly draft = signal({
    name: '',
    scopes: defaultScopes(),
  });
  protected readonly form = form(
    this.draft,
    (token) => {
      filled(token.name, this.text.nameRequired);
      maxLength(token.name, API_TOKEN_NAME_MAX_LENGTH);
      // A token allowed nothing is a row that can only mislead; the API
      // refuses one too. `required` takes an empty list as given, so the
      // count says it, as the same kind.
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
    return template.replace('{name}', value);
  }

  protected scopeLabel(scope: ApiTokenScope): string {
    return this.text.scopes[scope];
  }

  /** The capabilities on one row, in the order they are declared in rather
   * than the order they were stored in, so two tokens with the same grant read
   * the same. */
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
    return this.text.created
      .replace('{date}', this.moment().format(new Date(token.createdAt)))
      .replace('{actor}', token.createdBy ?? this.adminText.actorGone);
  }

  /**
   * The field this screen is really for: a token nobody has retired and nobody
   * uses is the one worth asking about, and it looks identical to a working
   * one until this line says otherwise.
   */
  protected usedLine(token: ApiToken): string {
    if (!token.lastUsedAt) return this.text.neverUsed;
    return this.text.lastUsed.replace(
      '{date}',
      this.moment().format(new Date(token.lastUsedAt)),
    );
  }

  protected startAdd(): void {
    this.draft.set({ name: '', scopes: defaultScopes() });
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
      // Clipboard access can be refused outright. The value is on screen and
      // selectable, so there is nothing to say and nothing to recover from.
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
