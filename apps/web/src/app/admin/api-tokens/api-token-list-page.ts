import { Component, computed, inject, resource, signal } from '@angular/core';
import {
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_SCOPES,
  ApiToken,
  ApiTokenScope,
  CreatedApiToken,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { ConfirmService } from '../../ui/confirm.service';
import { FieldLabel } from '../../ui/field-label';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge } from '../../ui/status-badge';
import { RecordFields, RecordFormActions } from '../records/record-form';
import { RecordRow } from '../records/record-row';
import { adminMomentFormat } from '../grid/admin-date';
import { ApiTokensService } from './api-tokens.service';

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
    Button,
    IconButton,
    AdminIcon,
    Input,
    FieldLabel,
    Checkbox,
    Skeleton,
    StatusBadge,
    RecordRow,
    RecordFields,
    RecordFormActions,
  ],
  template: `
    <div class="mb-4 flex items-start justify-between gap-4">
      <h1 class="text-3xl font-medium tracking-tight">{{ text.title }}</h1>
      <button
        appButton
        type="button"
        class="gap-2"
        [disabled]="adding()"
        (click)="startAdd()"
      >
        <app-admin-icon name="plus" class="h-4 w-4" />
        {{ text.add }}
      </button>
    </div>

    <p class="mb-6 max-w-3xl text-sm text-muted">{{ text.intro }}</p>

    <div class="max-w-3xl">
      <!-- The value, once. Amber rather than a plain card: this is the only
           panel in the admin that is worth interrupting for, and it stays put
           until it is dismissed — an admin who navigates away has not lost a
           step, they have lost the credential. -->
      @if (created(); as token) {
        <div
          class="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4"
          role="status"
        >
          <p class="text-sm font-medium text-amber-900">
            {{ fill(text.createdHeading, token.name) }}
          </p>
          <p class="mt-1 text-sm text-amber-800">{{ text.createdOnce }}</p>
          <div class="mt-3 flex items-center gap-2">
            <code
              class="min-w-0 flex-1 overflow-x-auto rounded border border-amber-300 bg-white px-2 py-1.5 font-mono text-sm break-all"
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
              <app-admin-icon
                [name]="copied() ? 'circle-check' : 'copy'"
                class="h-4 w-4"
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
            {{ text.createdDone }}
          </button>
        </div>
      }

      @if (tokens.error()) {
        <p class="text-muted" role="alert">{{ catalogText.loadError }}</p>
      } @else if (tokens.hasValue()) {
        <div class="divide-y divide-border border-y border-border">
          @for (token of tokens.value(); track token.id) {
            <div class="py-3">
              <!-- Three sentences, not three figures: what this credential
                   may do, who issued it when, and whether anything has used
                   it. Each on its own line. -->
              <app-record-row [stackMeta]="true">
                <span
                  class="font-medium"
                  [class]="token.revokedAt ? 'text-muted line-through' : ''"
                  >{{ token.name }}</span
                >
                <code class="font-mono text-sm text-subtle"
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
                      [attr.aria-label]="text.revoke"
                      [disabled]="busy()"
                      (click)="revoke(token)"
                    >
                      <app-admin-icon name="circle-slash" />
                    </button>
                  }
                </ng-container>
              </app-record-row>
              @if (rowError() === token.id) {
                <p class="mt-2 text-sm text-red-700" role="alert">
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
              <form appRecordFields (submit)="save($event)">
                <div>
                  <label appFieldLabel for="api-token-name">
                    {{ text.name }}
                    <span class="text-accent" aria-hidden="true">*</span>
                  </label>
                  <input
                    appInput
                    size="sm"
                    id="api-token-name"
                    name="name"
                    class="w-full"
                    autocomplete="off"
                    [attr.maxlength]="nameMaxLength"
                    [value]="draftName()"
                    [placeholder]="text.namePlaceholder"
                    (input)="draftName.set($any($event.target).value)"
                  />
                </div>
                <!-- One token, however many capabilities: the automated
                     client a deployment runs is usually one process doing
                     several things, and two credentials for it would be two
                     things to rotate and two to mix up.

                     A tick apiece rather than a multi-select, which hides
                     what is not chosen. While only one capability exists
                     there is nothing to ask, so it is stated instead; the
                     ticks appear on their own when a second one is added. -->
                @if (scopes.length > 1) {
                  <fieldset>
                    <legend appFieldLabel>
                      {{ text.scope }}
                      <span class="text-accent" aria-hidden="true">*</span>
                    </legend>
                    <div class="mt-1 flex flex-col gap-1.5">
                      @for (scope of scopes; track scope) {
                        <label class="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            appCheckbox
                            [checked]="draftScopes().includes(scope)"
                            (change)="toggleScope(scope)"
                          />
                          {{ scopeLabel(scope) }}
                        </label>
                      }
                    </div>
                  </fieldset>
                } @else {
                  <div>
                    <span appFieldLabel>{{ text.scope }}</span>
                    <p class="pt-1.5 text-sm">
                      {{ scopeList(draftScopes()) }}
                    </p>
                  </div>
                }
                <p class="text-xs text-muted sm:col-span-2">
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
                    <app-admin-icon name="save" class="h-4 w-4" />
                    {{ busy() ? common.saving : text.create }}
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
                    <app-admin-icon name="x" class="h-4 w-4" />
                    {{ common.cancel }}
                  </button>
                </div>
                @if (formError()) {
                  <p class="text-sm text-red-700 sm:col-span-2" role="alert">
                    {{ formError() }}
                  </p>
                }
              </form>
            </div>
          } @else if (tokens.value().length === 0) {
            <p class="py-3 text-sm text-muted">{{ text.empty }}</p>
          }
        </div>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="3" />
      }
    </div>
  `,
})
export class ApiTokenListPage {
  private readonly service = inject(ApiTokensService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).apiTokenList;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly catalogText = inject(APP_TEXT).catalog;
  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;

  /** Widened for the same reason `defaultScopes` widens: the template asks
   * how many there are. */
  protected readonly scopes: readonly ApiTokenScope[] = API_TOKEN_SCOPES;
  protected readonly nameMaxLength = API_TOKEN_NAME_MAX_LENGTH;

  protected readonly tokens = resource({ loader: () => this.service.list() });
  protected readonly showSkeleton = delayedLoading(this.tokens.isLoading);

  protected readonly adding = signal(false);
  protected readonly draftName = signal('');
  protected readonly draftScopes = signal<ApiTokenScope[]>(defaultScopes());
  protected readonly formError = signal<string | null>(null);
  /** The id of a row whose revoke was refused. */
  protected readonly rowError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly created = signal<CreatedApiToken | null>(null);
  protected readonly copied = signal(false);

  private readonly moment = computed(() => adminMomentFormat(this.locale));

  constructor() {
    usePageSeo({ name: () => this.text.title, noindex: true });
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
    this.draftScopes.update((current) =>
      current.includes(scope)
        ? current.filter((s) => s !== scope)
        : [...current, scope],
    );
  }

  protected createdLine(token: ApiToken): string {
    return this.text.created
      .replace('{date}', this.moment().format(new Date(token.createdAt)))
      .replace('{actor}', token.createdBy ?? this.text.actorGone);
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
    this.draftName.set('');
    this.draftScopes.set(defaultScopes());
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

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.draftName().trim();
    if (!name) {
      this.formError.set(this.text.nameRequired);
      return;
    }
    // A token allowed nothing is a row that can only mislead; the API refuses
    // one too, but the form should not have to ask.
    const scopes = this.draftScopes();
    if (scopes.length === 0) {
      this.formError.set(this.text.scopeRequired);
      return;
    }

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
      heading: this.text.revokeTitle,
      message: this.fill(this.text.revokeConfirm, token.name),
      warning: this.text.revokeWarning,
      confirmLabel: this.text.revoke,
      cancelLabel: this.common.cancel,
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
