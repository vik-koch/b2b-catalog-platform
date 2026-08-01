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
import { NotFoundView } from './not-found-view';
import { LoadErrorView } from './load-error-view';

@Component({
  selector: 'app-static-page',
  imports: [LucideIcon, IconButton, RouterLink, NotFoundView, LoadErrorView],
  template: `
    <!-- A published page with no row yet: an admin gets the shell and the
         pencil so they can write it, everyone else gets a real 404 rather than
         an empty page a crawler would index. -->
    @if (pageResource.error()) {
      <app-load-error-view [heading]="text.cannotLoadTitle" />
    } @else if (page() === null && !canEdit()) {
      <app-not-found-view />
    } @else if (page() !== undefined) {
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
            <app-lucide-icon name="pencil" class="h-4 w-4" />
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

  /** Delayed so a quick load never flashes a skeleton. */
  protected readonly showSkeleton = delayedLoading(this.pageResource.isLoading);

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
