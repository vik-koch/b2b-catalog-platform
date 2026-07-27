import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { Page, PageSlug } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { RichTextEditor } from '../admin/rich-text-editor';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { PageService } from './page.service';
import { trustedRichText } from './trusted-rich-text';

/**
 * Inline editing surface for a static page: title, body and a preview that
 * renders through the same `prose` container the public page uses.
 */
@Component({
  selector: 'app-page-editor',
  imports: [Button, RichTextEditor, LucideIcon],
  // Neutralize link navigation from the preview at the host: a native click on
  // a rendered link would leave the page without the unsaved-changes guard.
  host: { '(click)': 'onPreviewClick($event)' },
  template: `
    @if (previewing()) {
      <p
        class="mb-6 rounded-md bg-stone-100 px-4 py-2 text-sm text-stone-600"
        role="status"
      >
        {{ text.previewNotice }}
      </p>
      <h1 class="mb-6 text-3xl font-bold tracking-tight">{{ title() }}</h1>
      <div
        class="prose prose-stone max-w-none"
        [innerHTML]="safeBody(body())"
      ></div>
    } @else {
      <label class="mb-6 block">
        <span class="mb-1 block text-sm font-medium">{{ text.pageTitle }}</span>
        <input
          type="text"
          class="w-full rounded-md border border-stone-300 px-3 py-2 text-lg focus:border-primary focus:outline-none"
          [value]="title()"
          (input)="onTitleInput($event)"
        />
      </label>

      <app-rich-text-editor
        [value]="body()"
        (contentChange)="body.set($event)"
      />
    }

    @if (error()) {
      <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
    }

    <div class="mt-6 flex flex-wrap gap-3">
      <button
        appButton
        type="button"
        class="gap-2"
        [disabled]="saving()"
        (click)="save()"
      >
        <app-lucide-icon name="save" class="h-4 w-4" />
        {{ saving() ? text.saving : text.save }}
      </button>
      <button
        appButton
        variant="secondary"
        type="button"
        class="gap-2"
        (click)="previewing.set(!previewing())"
      >
        <app-lucide-icon
          [name]="previewing() ? 'pencil' : 'eye'"
          class="h-4 w-4"
        />
        {{ previewing() ? text.resumeEditing : text.preview }}
      </button>
      <button
        appButton
        variant="secondary"
        type="button"
        class="gap-2"
        (click)="cancel()"
      >
        <app-lucide-icon name="x" class="h-4 w-4" />
        {{ text.cancel }}
      </button>
    </div>
  `,
})
export class PageEditor {
  private readonly pageService = inject(PageService);
  protected readonly text = inject(APP_TEXT).pageEditor;
  /** Bypasses Angular's redundant innerHTML sanitizer for the server-sanitized
   * preview body — see trustedRichText. */
  protected readonly safeBody = trustedRichText();

  readonly slug = input.required<PageSlug>();
  readonly page = input.required<Page>();

  /** Emits the saved page so the host can render the server's stored form. */
  readonly saved = output<Page>();
  readonly closed = output<void>();
  /** Lets the host warn before a navigation abandons unsaved edits. */
  readonly dirtyChange = output<boolean>();

  // Seeded from the page, and re-seeded whenever a save replaces it.
  protected readonly title = linkedSignal(() => this.page().title);
  protected readonly body = linkedSignal(() => this.page().bodyHtml);
  protected readonly previewing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly dirty = computed(
    () =>
      this.title() !== this.page().title ||
      this.body() !== this.page().bodyHtml,
  );

  constructor() {
    effect(() => this.dirtyChange.emit(this.dirty()));
  }

  protected onTitleInput(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
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
    if (!this.title().trim()) {
      this.error.set(this.text.titleRequired);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await this.pageService.updatePage(this.slug(), {
        title: this.title().trim(),
        bodyHtml: this.body(),
      });
      this.saved.emit(saved);
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    if (this.dirty() && !window.confirm(this.text.discardConfirm)) {
      return;
    }
    this.closed.emit();
  }
}
