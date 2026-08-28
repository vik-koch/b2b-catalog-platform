import { Component, computed, inject, input, resource } from '@angular/core';
import { PageSlug } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { injectEditorReturnParams } from '../admin/editor-return';
import { editAwareContent } from '../admin/edit-aware-content';
import { EditActions } from '../admin/edit-actions';
import { usePageSeo } from '../core/page-seo';
import { PageService } from './page.service';
import { trustedRichText } from '../core/trusted-rich-text';
import { LoadErrorView } from './load-error-view';

@Component({
  selector: 'app-static-page',
  imports: [EditActions, LoadErrorView],
  template: `
    <!-- A published page with no row yet: an admin gets the shell and the
         pencil so they can write it, everyone else gets the load error rather
         than an empty page a crawler would index.
         503 and not 404, matching a failed load: the route only exists because
         the deployment publishes this slug, so the URL is real and the content
         is missing — "temporarily unavailable" is the true answer, and it is
         the one that shows up in the access logs as something to fix. An
         unpublished slug never reaches here; its route does not match, and that
         is where the honest 404 comes from. -->
    @if (pageResource.error()) {
      <app-load-error-view [heading]="text.cannotLoadTitle" />
    } @else if (missing()) {
      <app-load-error-view [heading]="text.cannotLoadTitle" />
    } @else if (ready()) {
      @let content = page();
      <div class="flex items-start justify-between gap-4">
        <h1 class="mb-6 text-3xl font-medium tracking-tight">
          {{ content?.title || navLabel }}
        </h1>
        @if (canEdit(); as editorText) {
          <app-edit-actions
            variant="inline"
            [editLink]="['/admin/pages', slug(), 'edit']"
            [editParams]="editorFrom()"
            [editLabel]="editorText.edit"
          />
        }
      </div>
      @if (content) {
        <div
          class="prose prose-stone max-w-3xl"
          [innerHTML]="safeBody(content.bodyHtml)"
        ></div>
      } @else if (canEdit(); as editorText) {
        <p class="text-muted">{{ editorText.emptyNotice }}</p>
      }
    } @else if (showSkeleton()) {
      <div class="animate-pulse space-y-4" aria-hidden="true">
        <div class="h-8 w-1/3 rounded bg-stone-200"></div>
        <div class="h-4 w-full rounded bg-stone-200"></div>
        <div class="h-4 w-5/6 rounded bg-stone-200"></div>
      </div>
    }
  `,
})
export class StaticPage {
  private pageService = inject(PageService);

  protected readonly text = inject(APP_TEXT).errors;
  private readonly navText = inject(APP_TEXT).nav;
  protected readonly editorFrom = injectEditorReturnParams();
  /** Bypasses Angular's redundant innerHTML sanitizer for the server-sanitized
   * page body — see trustedRichText. */
  protected readonly safeBody = trustedRichText();

  slug = input.required<PageSlug>();
  pageResource = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.pageService.getPage(params.slug),
  });

  /** The body and the pencil appear together, once the page and the visitor's
   * role are both known — see editAwareContent. */
  private readonly content = editAwareContent({
    ready: computed(() => this.page() !== undefined),
    section: 'pageEditor',
  });
  protected readonly ready = this.content.ready;
  protected readonly canEdit = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;

  /** No row, and nobody here who could write one: the page cannot be served.
   * Waits on `ready`, so an admin is never shown the error on their way to the
   * shell they would write it in. */
  protected readonly missing = computed(
    () => this.ready() && this.page() === null && !this.canEdit(),
  );

  /**
   * `undefined` while loading *or failed*, `null` when the page has no row yet.
   * Guarded: `value()` throws on an errored resource, and an unguarded read
   * during SSR kills the render before it can set a status.
   */
  protected readonly page = computed(() =>
    this.pageResource.hasValue() ? this.pageResource.value() : undefined,
  );

  /** Heading for a page that has no stored title yet. */
  protected get navLabel(): string {
    return this.navText[this.slug()] ?? '';
  }

  constructor() {
    usePageSeo({ name: () => this.page()?.title });
  }
}
