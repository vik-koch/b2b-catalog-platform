import { Component, computed, inject, input, resource } from '@angular/core';
import { PageSlug } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { injectEditorReturnParams } from '../../shared/edit-mode/editor-return';
import { editAwareContent } from '../../shared/edit-mode/edit-aware-content';
import { EditActions } from '../../shared/edit-mode/edit-actions';
import { usePageSeo } from '../../shared/core/page-seo';
import { PageService } from '../../shared/pages/page.service';
import { RichTextLinks } from '../../shared/core/rich-text-links';
import { trustedRichText } from '../../shared/core/trusted-rich-text';
import { LoadErrorView } from './load-error-view';
import { PageUpdated } from './page-updated';
import { PageTitle } from '../../shared/ui/page-title';

@Component({
  selector: 'app-static-page',
  imports: [RichTextLinks, EditActions, LoadErrorView, PageUpdated, PageTitle],
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
        <h1 appPageTitle class="mb-4">
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
          class="prose max-w-3xl"
          appRichTextLinks
          [innerHTML]="safeBody(content.bodyHtml)"
        ></div>
        <app-page-updated
          class="mt-8"
          [slug]="slug()"
          [updatedAt]="content.updatedAt"
        />
      } @else if (canEdit(); as editorText) {
        <p class="text-subtle">{{ editorText.emptyNotice }}</p>
      }
    } @else if (showSkeleton()) {
      <div class="animate-pulse space-y-4" aria-hidden="true">
        <div class="h-8 w-1/3 rounded-sm bg-skeleton"></div>
        <div class="h-4 w-full rounded-sm bg-skeleton"></div>
        <div class="h-4 w-5/6 rounded-sm bg-skeleton"></div>
      </div>
    }
  `,
})
export class StaticPage {
  private pageService = inject(PageService);

  protected readonly text = inject(STOREFRONT_TEXT).errors;
  private readonly navText = inject(SHARED_TEXT).nav;
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
    section: 'pages',
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
