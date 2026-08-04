import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageSlug } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { injectEditorReturnParams } from '../admin/editor-return';
import { adminText } from '../config/admin-text';
import { usePageSeo } from '../core/page-seo';
import { EditModeService } from '../admin/edit-mode.service';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { PageService } from './page.service';
import { trustedRichText } from '../core/trusted-rich-text';
import { IconButton } from '../ui/icon-button';
import { LoadErrorView } from './load-error-view';

@Component({
  selector: 'app-static-page',
  imports: [LucideIcon, IconButton, RouterLink, LoadErrorView],
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
    } @else if (page() !== undefined && !awaitingRole()) {
      @let content = page();
      <div class="flex items-start justify-between gap-4">
        <h1 class="mb-6 text-3xl font-bold tracking-tight">
          {{ content?.title || navLabel }}
        </h1>
        @if (canEdit(); as editorText) {
          <!-- Editing happens on its own admin route, like products and
               categories; this is the storefront's shortcut into it, so the
               editor bundle never loads for a public visitor. -->
          <a
            appIconButton
            [routerLink]="['/admin/pages', slug(), 'edit']"
            [queryParams]="editorFrom"
            [attr.aria-label]="editorText.edit"
            [attr.title]="editorText.edit"
          >
            <app-lucide-icon name="pencil" class="h-5 w-5" />
          </a>
        }
      </div>
      @if (content) {
        <div
          class="prose prose-stone max-w-none"
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
  private readonly editMode = inject(EditModeService);

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

  /**
   * A page with no row yet, while it is still unknown whether this visitor is
   * an admin who could write one. The body has loaded, so the resource is no
   * longer the thing being waited on — the session is.
   */
  protected readonly awaitingRole = computed(
    () => this.page() === null && !this.editMode.settled(),
  );

  /** No row, and nobody here who could write one: the page cannot be served. */
  protected readonly missing = computed(
    () => this.page() === null && this.editMode.settled() && !this.canEdit(),
  );

  /** Delayed so a quick load never flashes a skeleton — and covering the wait
   * on the session too, so that gap is a placeholder rather than a blank. */
  protected readonly showSkeleton = delayedLoading(
    computed(() => this.pageResource.isLoading() || this.awaitingRole()),
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

  /**
   * The editing affordance, carrying its own wording: this is a public route,
   * so the admin text is fetched rather than injected and is null until edit
   * mode is on (see EditModeService). Absent during SSR and before the session
   * resolves, consistent with products and categories.
   */
  protected readonly canEdit = computed(() =>
    this.editMode.enabled() ? (adminText()?.pageEditor ?? null) : null,
  );
}
