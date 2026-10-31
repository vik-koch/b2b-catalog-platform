import {
  afterNextRender,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { form, hidden, maxLength, validate } from '@angular/forms/signals';
import { filled } from '../../../shared/core/field-rules';
import {
  CONSENT_LABEL_MAX_LENGTH,
  consentLabelParts,
  isConsentPage,
  Page,
  PageSlug,
} from '@b2b-catalog-platform/shared/core/site';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';
import { RichTextEditor } from '../../rich-text/rich-text-editor';
import { injectConfirmDiscard } from '../../confirm-discard';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import {
  FieldAttempt,
  FIELD_ATTEMPT,
} from '@b2b-catalog-platform/ui/fields/field-attempt';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import { PageEditingService } from './page-editing.service';
import { trustedRichText } from '../../../shared/core/trusted-rich-text';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { eyeIcon } from '@b2b-catalog-platform/ui/icons/glyphs/eye';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { SaveButton } from '../../ui/save-button';
import { CancelButton } from '../../ui/cancel-button';
import { SHARED_TEXT } from '../../../shared/config/shared-text';

/**
 * The editing surface for a static page: title, body and a preview that renders
 * through the same `prose` container the public page uses. Presentational — the
 * route around it (page-editor-page) owns loading, saving and where to go next.
 */
@Component({
  selector: 'app-page-editor',
  imports: [
    CancelButton,
    SaveButton,
    Button,
    RichTextEditor,
    Icon,
    FORM_FIELDS,
    Input,
    Checkbox,
    TickLabel,
    PageTitle,
    ErrorText,
    Notice,
  ],
  // No <form> element: the buttons under the page save, preview or leave, so
  // the editor says itself when the form has been sent.
  providers: [
    { provide: FIELD_ATTEMPT, useExisting: forwardRef(() => PageEditor) },
  ],
  // Neutralize link navigation from the preview at the host: a native click on
  // a rendered link would leave the page without the unsaved-changes guard.
  host: { '(click)': 'onPreviewClick($event)' },
  template: `
    @if (previewing()) {
      <p uiNotice tone="neutral" class="mb-6" role="status">
        {{ text.previewNotice }}
      </p>
      <h1 uiPageTitle class="mb-4">{{ title() }}</h1>
      <!-- The published width, so the preview shows the line breaks the
           visitor will get — the same measure the editing surface uses. -->
      <div class="prose max-w-3xl" [innerHTML]="safeBody(body())"></div>
      @if (isConsent()) {
        <div class="mt-8 max-w-3xl border-t border-edge pt-4">
          <p class="mb-2 text-sm text-ink-subtle">{{ text.consentPreview }}</p>
          <label uiTickLabel>
            <input type="checkbox" uiCheckbox disabled />
            @if (consentParts(); as parts) {
              <span
                >{{ parts.before
                }}<span class="underline">{{ parts.link }}</span
                >{{ parts.after }}</span
              >
            } @else {
              <span>{{ consentLabel() }}</span>
            }
          </label>
        </div>
      }
    } @else {
      <h1 uiPageTitle class="mb-4">
        {{ isNew() ? text.newTitle : text.editTitle }}
      </h1>
      <!-- The published measure, which is what the preview above uses: text
           typed at one width and read at another breaks in different places,
           and where a heading lands is half of what is being edited. -->
      <div class="max-w-3xl">
        <ui-field
          class="mb-6"
          [field]="form.title"
          [label]="text.pageTitle"
          controlId="page-title"
        >
          <input type="text" uiInput class="w-full" [formField]="form.title" />
        </ui-field>

        @if (isConsent()) {
          <ui-field
            class="mb-6"
            [field]="form.consentLabel"
            [label]="text.consentLabel"
            [hint]="text.consentLabelHint"
            controlId="consent-label"
          >
            <textarea
              uiInput
              rows="2"
              class="w-full"
              [formField]="form.consentLabel"
            ></textarea>
          </ui-field>
        }

        <app-rich-text-editor
          [value]="body()"
          (contentChange)="body.set($event)"
        />
      </div>
    }

    @if (error()) {
      <p uiErrorText class="mt-4 max-w-3xl" role="alert">
        {{ error() }}
      </p>
    }

    <div class="mt-6 flex max-w-3xl flex-wrap gap-3">
      <button
        uiButton
        appSaveButton
        type="button"
        [saving]="saving()"
        (click)="save()"
      >
        {{ adminText.actions.save }}
      </button>
      <button
        uiButton
        variant="secondary"
        type="button"
        class="gap-2"
        (click)="previewing.set(!previewing())"
      >
        <ui-icon [glyph]="previewing() ? pencilIcon : eyeIcon" class="size-4" />
        {{
          previewing()
            ? adminText.actions.resumeEditing
            : adminText.actions.preview
        }}
      </button>
      <button
        uiButton
        variant="secondary"
        appCancelButton
        type="button"
        (click)="cancel()"
      >
        {{ actionText.cancel }}
      </button>
    </div>
  `,
})
export class PageEditor implements FieldAttempt {
  protected readonly eyeIcon = eyeIcon;
  protected readonly pencilIcon = pencilIcon;
  private readonly pageService = inject(PageEditingService);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly text = inject(ADMIN_TEXT).pages;
  private readonly confirmDiscard = injectConfirmDiscard();
  /** Bypasses Angular's redundant innerHTML sanitizer for the server-sanitized
   * preview body — see trustedRichText. */
  protected readonly safeBody = trustedRichText();

  readonly slug = input.required<PageSlug>();
  readonly page = input.required<Page>();
  /** True when the page has no row yet, so this save creates it. */
  readonly isNew = input(false);

  /** Emits the saved page so the host can render the server's stored form. */
  readonly saved = output<Page>();
  readonly closed = output<void>();
  /** Lets the host warn before a navigation abandons unsaved edits. */
  readonly dirtyChange = output<boolean>();

  // Seeded from the page, and re-seeded whenever a save replaces it.
  private readonly model = linkedSignal(() => ({
    title: this.page().title,
    consentLabel: this.page().consentLabel ?? '',
  }));
  protected readonly body = linkedSignal(() => this.page().bodyHtml);
  protected readonly isConsent = computed(() => isConsentPage(this.slug()));
  protected readonly form = form(
    this.model,
    (page) => {
      filled(page.title, this.text.titleRequired);
      // Only the consent page carries the box's label.
      hidden(page.consentLabel, { when: () => !this.isConsent() });
      filled(page.consentLabel, this.text.consentLabelRequired);
      maxLength(page.consentLabel, CONSENT_LABEL_MAX_LENGTH);
      validate(page.consentLabel, ({ value }) =>
        value().trim() && !consentLabelParts(value().trim())
          ? { kind: 'consentLink', message: this.text.consentLabelLink }
          : undefined,
      );
    },
    { name: 'page-editor' },
  );
  /** Read by every field in the editor (FIELD_ATTEMPT). */
  readonly attempted = computed(() => submitAttempt(this.form)());
  private readonly injector = inject(Injector);
  protected readonly title = computed(() => this.model().title);
  protected readonly consentLabel = computed(() => this.model().consentLabel);
  protected readonly consentParts = computed(() =>
    consentLabelParts(this.consentLabel().trim()),
  );
  protected readonly previewing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly dirty = computed(
    () =>
      this.title() !== this.page().title ||
      this.body() !== this.page().bodyHtml ||
      this.consentLabel() !== (this.page().consentLabel ?? ''),
  );

  constructor() {
    effect(() => this.dirtyChange.emit(this.dirty()));
  }

  /**
   * Preview is a visual preview, not a live page. Its body renders real anchors
   * (text links, linked images); a native click on one would leave the page
   * *without* passing through the unsaved-changes route guard, silently dropping
   * the edit. Neutralize link clicks while previewing — the admin resumes
   * editing or uses the app's own navigation, which the guard protects. Scoped
   * to preview so it never interferes with the editor or toolbar. A keyboard
   * Enter on a link also dispatches a click, so this covers that too.
   */
  protected onPreviewClick(event: MouseEvent): void {
    if (this.previewing() && (event.target as HTMLElement).closest('a')) {
      event.preventDefault();
    }
  }

  protected async save(): Promise<void> {
    submitAttempt(this.form).set(true);
    if (this.form().invalid()) {
      // Back from the preview to the field that stopped it.
      const first = this.form().errorSummary()[0]?.fieldTree;
      this.previewing.set(false);
      afterNextRender(() => first?.().focusBoundControl(), {
        injector: this.injector,
      });
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await this.pageService.updatePage(this.slug(), {
        title: this.title().trim(),
        bodyHtml: this.body(),
        ...(this.isConsent() && { consentLabel: this.consentLabel().trim() }),
      });
      this.saved.emit(saved);
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.saving.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    if (
      this.dirty() &&
      !(await this.confirmDiscard(this.text.discardConfirm))
    ) {
      return;
    }
    this.closed.emit();
  }
}
