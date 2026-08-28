import { Component, computed, inject, resource } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { injectEditorReturnParams } from '../admin/editor-return';
import { editAwareContent } from '../admin/edit-aware-content';
import { EditActions } from '../admin/edit-actions';
import { usePageSeo } from '../core/page-seo';
import { MapFrame } from './map-frame';
import { PageService } from './page.service';
import { LoadErrorView } from './load-error-view';
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
  imports: [MapFrame, EditActions, LoadErrorView],
  template: `
    <!-- Nothing renders before the body arrives, heading included. The office
         list comes from deployment config and would otherwise paint instantly,
         then be shoved down when the prose lands — the page appears in one
         piece instead of assembling itself in front of the visitor.

         A body that failed or was never written takes the whole page down with
         it, rather than leaving the office list standing under an empty
         heading: the prose is what /contact is, and a page missing it is not
         serving its content. LoadErrorView owns the 503 that says so, as it
         does for every other page slug. An admin is spared only the unwritten
         case — the shell and the pencil are how they write it — never the
         failure, which is as much an outage for them as for anyone. -->
    @if (pageResource.error()) {
      <app-load-error-view [heading]="errorText.cannotLoadTitle" />
    } @else if (missing()) {
      <app-load-error-view [heading]="errorText.cannotLoadTitle" />
    } @else if (ready()) {
      <div class="flex items-start justify-between gap-4">
        <h1 class="mb-6 text-3xl font-bold tracking-tight">{{ heading }}</h1>
        @if (canEdit(); as editorText) {
          <app-edit-actions
            variant="inline"
            [editLink]="['/admin/pages', 'contact', 'edit']"
            [editParams]="editorFrom()"
            [editLabel]="editorText.edit"
          />
        }
      </div>

      <!-- Only an admin reaches this without a body — the shell and the pencil
           are how they get one written. -->
      @if (page(); as content) {
        <div
          class="prose prose-stone mb-8 max-w-3xl"
          [innerHTML]="safeBody(content.bodyHtml)"
        ></div>
      } @else if (canEdit(); as editorText) {
        <p class="mb-8 text-muted">{{ editorText.emptyNotice }}</p>
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
    } @else if (showSkeleton()) {
      <div class="animate-pulse space-y-4" aria-hidden="true">
        <div class="h-8 w-1/3 rounded bg-stone-200"></div>
        <div class="h-4 w-full rounded bg-stone-200"></div>
        <div class="h-4 w-5/6 rounded bg-stone-200"></div>
      </div>
    }
  `,
})
export class ContactPage {
  private readonly appText = inject(APP_TEXT);
  private readonly pageService = inject(PageService);

  protected readonly heading = this.appText.nav['contact'];
  protected readonly errorText = this.appText.errors;
  protected readonly locations = inject(DEPLOYMENT_CONFIG).locations;
  protected readonly editorFrom = injectEditorReturnParams();
  /** Bypasses Angular's redundant innerHTML sanitizer for the server-sanitized
   * page body — see trustedRichText. */
  protected readonly safeBody = trustedRichText();

  protected readonly pageResource = resource({
    loader: () => this.pageService.getPage('contact'),
  });

  // `undefined` while loading *or failed*, `null` when the page has no row yet.
  // Guarded: `value()` throws on an errored resource, and an unguarded read
  // during SSR kills the render before it can set a status.
  protected readonly page = computed(() =>
    this.pageResource.hasValue() ? this.pageResource.value() : undefined,
  );

  /** The body, the office list and the pencil appear together, once the page
   * and the visitor's role are both known — see editAwareContent. */
  private readonly content = editAwareContent({
    ready: computed(
      () =>
        !this.pageResource.isLoading() && this.pageResource.status() !== 'idle',
    ),
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

  constructor() {
    usePageSeo({ name: () => this.heading });
  }
}
