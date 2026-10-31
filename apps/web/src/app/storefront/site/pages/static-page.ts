import {
  Component,
  computed,
  contentChild,
  inject,
  input,
  resource,
  TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PageSlug } from '@b2b-catalog-platform/shared/core/site';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { editAwareContent } from '../../../shared/edit-mode/edit-aware-content';
import { EditActions } from '../../../shared/edit-mode/edit-actions';
import { usePageSeo } from '../../../shared/core/page-seo';
import { PageService } from '../../../core/site/page.service';
import { RichTextLinks } from '../../../shared/core/rich-text-links';
import { trustedRichText } from '../../../shared/core/trusted-rich-text';
import { LoadErrorView } from '../../platform/load-error-view';
import { PageUpdated } from './page-updated';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';

/**
 * A page's editable prose, with what a code route states from configuration
 * below it, given as an `<ng-template>`. Nothing renders before the body: the
 * configured part would paint at once and be shoved down when the prose lands.
 */
@Component({
  selector: 'app-static-page',
  imports: [
    NgTemplateOutlet,
    RichTextLinks,
    EditActions,
    LoadErrorView,
    PageUpdated,
    PageTitle,
    Skeleton,
  ],
  template: `
    <!-- A body that failed or was never written takes the page down: a 503,
         since the deployment publishes the slug and only the content is
         missing. An admin is spared the unwritten case, to write it. -->
    @if (pageResource.error() || missing()) {
      <app-load-error-view [heading]="text.cannotLoadTitle" />
    } @else if (ready()) {
      @let content = page();
      <div class="flex items-start justify-between gap-4">
        <h1 uiPageTitle class="mb-4">{{ title() }}</h1>
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
        <p class="text-ink-subtle">{{ editorText.emptyNotice }}</p>
      }
      @if (configured(); as configured) {
        <div class="mt-8">
          <ng-container [ngTemplateOutlet]="configured" />
        </div>
      }
    } @else if (showSkeleton()) {
      <ui-skeleton size="title" class="mb-4" [widths]="['33%']" />
      <ui-skeleton [widths]="['100%', '83%']" />
    }
  `,
})
export class StaticPage {
  private readonly pageService = inject(PageService);
  private readonly nav = inject(SHARED_TEXT).nav;

  readonly slug = input.required<PageSlug>();

  protected readonly text = inject(STOREFRONT_TEXT).errors;
  protected readonly configured = contentChild(TemplateRef);
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly safeBody = trustedRichText();

  protected readonly pageResource = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.pageService.getPage(params.slug),
  });

  /**
   * `undefined` while loading or failed, `null` with no row yet. Guarded:
   * `value()` throws on an errored resource, which would kill an SSR render
   * before it sets a status.
   */
  protected readonly page = computed(() =>
    this.pageResource.hasValue() ? this.pageResource.value() : undefined,
  );

  private readonly content = editAwareContent({
    ready: computed(() => this.page() !== undefined),
    section: 'pages',
  });
  protected readonly ready = this.content.ready;
  protected readonly canEdit = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;

  /** Waits on `ready`, so an admin never sees the error on the way to writing. */
  protected readonly missing = computed(
    () => this.ready() && this.page() === null && !this.canEdit(),
  );

  /** The nav label stands in until the page has a stored title. */
  protected readonly title = computed(
    () => this.page()?.title || (this.nav[this.slug()] ?? ''),
  );

  constructor() {
    usePageSeo({ name: () => this.title() || undefined });
  }
}
