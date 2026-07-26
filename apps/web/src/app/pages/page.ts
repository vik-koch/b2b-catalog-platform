import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Page as PageContent, PageSlug } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { AuthService } from '../auth/auth.service';
import { PencilIcon } from '../ui/icons/pencil-icon';
import { PageEditor } from './page-editor';
import { PageService } from './page.service';
import { UnsavedChangesAware } from './unsaved-changes.guard';

@Component({
  selector: 'app-page',
  imports: [PencilIcon, PageEditor],
  template: `
    @if (current(); as page) {
      @if (editing()) {
        <!-- Deferred: the editor bundle never reaches a public visitor. -->
        @defer {
          <app-page-editor
            [slug]="slug()"
            [page]="page"
            (saved)="onSaved($event)"
            (dirtyChange)="editorDirty.set($event)"
            (closed)="editing.set(false)"
          />
        } @placeholder {
          <div class="h-8 w-1/3 animate-pulse rounded bg-stone-200"></div>
        }
      } @else {
        <div class="flex items-start justify-between gap-4">
          <h1 class="mb-6 text-3xl font-bold tracking-tight">
            {{ page.title }}
          </h1>
          @if (canEdit()) {
            <button
              type="button"
              class="-mt-1 rounded-md p-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-ink"
              [attr.aria-label]="editorText.edit"
              [attr.title]="editorText.edit"
              (click)="editing.set(true)"
            >
              <app-pencil-icon class="h-5 w-5" />
            </button>
          }
        </div>
        <div
          class="prose prose-stone max-w-none"
          [innerHTML]="page.bodyHtml"
        ></div>
      }
    } @else if (pageResource.error()) {
      <h1 class="text-3xl font-bold tracking-tight">
        {{ text.cannotLoadTitle }}
      </h1>
      <p class="mt-4 text-stone-600">{{ text.cannotLoadBody }}</p>
    } @else {
      <div class="animate-pulse space-y-4" aria-hidden="true">
        <div class="h-8 w-1/3 rounded bg-stone-200"></div>
        <div class="h-4 w-full rounded bg-stone-200"></div>
        <div class="h-4 w-5/6 rounded bg-stone-200"></div>
      </div>
    }
  `,
})
export class Page implements UnsavedChangesAware {
  private pageService = inject(PageService);
  private auth = inject(AuthService);

  protected readonly text = inject(APP_TEXT).errors;
  protected readonly editorText = inject(APP_TEXT).pageEditor;

  slug = input.required<PageSlug>();
  pageResource = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.pageService.getPage(params.slug),
  });

  /** Set by a save, so the page shows the stored form without a refetch. */
  private readonly saved = signal<PageContent | null>(null);
  protected readonly current = computed(
    () => this.saved() ?? this.pageResource.value(),
  );

  protected readonly editing = signal(false);
  protected readonly editorDirty = signal(false);

  // False during SSR and until /auth/me answers, so the pencil appears only
  // once the session is known.
  protected readonly canEdit = computed(
    () => this.auth.user()?.role === 'admin',
  );

  hasUnsavedChanges(): boolean {
    return this.editing() && this.editorDirty();
  }

  protected onSaved(page: PageContent): void {
    this.saved.set(page);
    this.editing.set(false);
  }
}
