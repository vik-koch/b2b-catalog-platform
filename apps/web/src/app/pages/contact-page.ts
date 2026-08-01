import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { adminText } from '../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { EditModeService } from '../admin/edit-mode.service';
import { injectEditorReturnParams } from '../admin/editor-return';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { IconButton } from '../ui/icon-button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { Skeleton } from '../ui/skeleton';
import { MapFrame } from './map-frame';
import { PageService } from './page.service';
import { trustedRichText } from '../core/trusted-rich-text';

/**
 * Contact page — a code route that renders an editable body.
 *
 * The split is the one the rest of the app follows: prose is content, so it is
 * a Page the admin edits like any other; the office list and its map embeds are
 * structured deployment config, so they stay code. That is why `contact` has a
 * page body but no place in STANDALONE_PAGE_SLUGS — this component owns the
 * markup around the body instead of the generic `/:slug` route. Maps render
 * through MapFrame, which owns the iframe-only + consent rules.
 */
@Component({
  selector: 'app-contact-page',
  imports: [MapFrame, IconButton, LucideIcon, RouterLink, Skeleton],
  template: `
    <div class="flex items-start justify-between gap-4">
      <h1 class="mb-4 text-3xl font-bold tracking-tight">{{ heading }}</h1>
      @if (canEdit(); as editorText) {
        <a
          appIconButton
          [routerLink]="['/admin/pages', 'contact', 'edit']"
          [queryParams]="editorFrom"
          [attr.aria-label]="editorText.edit"
          [attr.title]="editorText.edit"
        >
          <app-lucide-icon name="pencil" class="h-4 w-4" />
        </a>
      }
    </div>

    <!-- No body yet is fine here: the office list below is real content in its
         own right, so the page stands without prose. Only an admin is told. -->
    @if (page(); as content) {
      <div
        class="prose prose-stone mb-8 max-w-none"
        [innerHTML]="safeBody(content.bodyHtml)"
      ></div>
    } @else if (page() === null) {
      @if (canEdit(); as editorText) {
        <p class="mb-8 text-muted">{{ editorText.emptyNotice }}</p>
      }
    } @else if (showSkeleton()) {
      <app-skeleton class="mb-8" [lines]="2" />
    }

    <div class="space-y-10">
      @for (location of locations; track location.name) {
        <section>
          <h2 class="text-xl font-semibold">{{ location.name }}</h2>
          @if (location.description) {
            <p class="mt-1 text-muted">{{ location.description }}</p>
          }
          <app-map-frame
            class="mt-4 block"
            [map]="location.map"
            [title]="location.name + ' map'"
          />
        </section>
      }
    </div>
  `,
})
export class ContactPage {
  private readonly appText = inject(APP_TEXT);
  private readonly pageService = inject(PageService);
  private readonly editMode = inject(EditModeService);

  protected readonly heading = this.appText.nav['contact'];
  protected readonly locations = inject(DEPLOYMENT_CONFIG).locations;
  protected readonly editorFrom = injectEditorReturnParams();
  /** Bypasses Angular's redundant innerHTML sanitizer for the server-sanitized
   * page body — see trustedRichText. */
  protected readonly safeBody = trustedRichText();

  private readonly pageResource = resource({
    loader: () => this.pageService.getPage('contact'),
  });

  // Guarded: `value()` throws on an errored resource. The page still stands
  // without its prose — the office list is config — so a failed body is not an
  // outage here, just a missing block.
  protected readonly page = computed(() =>
    this.pageResource.hasValue() ? this.pageResource.value() : undefined,
  );

  /** Delayed so a quick load never flashes a skeleton. */
  protected readonly showSkeleton = delayedLoading(this.pageResource.isLoading);

  /**
   * The editing affordance, carrying its own wording: this is a public route,
   * so the admin text is fetched rather than injected and is null until edit
   * mode is on (see EditModeService).
   */
  protected readonly canEdit = computed(() =>
    this.editMode.enabled() ? (adminText()?.pageEditor ?? null) : null,
  );

  constructor() {
    usePageSeo({ name: () => this.heading });
  }
}
