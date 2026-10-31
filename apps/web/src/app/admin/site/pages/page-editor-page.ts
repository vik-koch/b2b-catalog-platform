import { Component, inject, resource, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Page, PageSlug } from '@b2b-catalog-platform/shared/core/site';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { PageEditor } from './page-editor';
import { PageHistory } from './page-history';
import { PageService } from '../../../core/site/page.service';
import { UnsavedChangesAware } from '../../unsaved-changes.guard';
import { injectEditorReturn } from '../../../shared/edit-mode/editor-return';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';

/**
 * Returns to whichever opened it, the panel or the storefront's pencil. A page
 * with no row yet is where every page of a real deployment starts.
 */
@Component({
  selector: 'app-page-editor-page',
  imports: [PageEditor, PageHistory, Skeleton],
  template: `
    @if (page.hasValue()) {
      <app-page-editor
        [slug]="slug"
        [page]="page.value() ?? blankPage"
        [isNew]="page.value() === null"
        (saved)="leave()"
        (closed)="leave()"
        (dirtyChange)="editorDirty.set($event)"
      />
      <app-page-history [slug]="slug" />
    } @else if (page.error()) {
      <p class="text-ink-subtle" role="alert">{{ text.saveError }}</p>
    } @else if (showSkeleton()) {
      <ui-skeleton size="title" class="mb-4" [widths]="['33%']" />
      <ui-skeleton [widths]="['100%']" />
    }
  `,
})
export class PageEditorPage implements UnsavedChangesAware {
  private readonly pageService = inject(PageService);
  protected readonly text = inject(ADMIN_TEXT).pages;

  protected readonly slug = (inject(ActivatedRoute).snapshot.paramMap.get(
    'slug',
  ) ?? '') as PageSlug;

  protected readonly page = resource({
    loader: () => this.pageService.getPage(this.slug),
  });

  /** Named from the navigation, so the required title is not left empty. */
  protected readonly blankPage: Page = {
    version: 0,
    title: inject(SHARED_TEXT).nav[this.slug] ?? '',
    bodyHtml: '',
    consentLabel: null,
    updatedAt: '',
  };

  protected readonly showSkeleton = delayedLoading(this.page.isLoading);

  protected readonly editorDirty = signal(false);
  private navigatingAway = false;
  private readonly close = injectEditorReturn();

  hasUnsavedChanges(): boolean {
    return !this.navigatingAway && this.editorDirty();
  }

  /** The editor has asked about unsaved work already; the guard must not. */
  protected leave(): void {
    this.navigatingAway = true;
    void this.close('/admin');
  }

  constructor() {
    usePageSeo({
      name: () =>
        this.page.value() === null ? this.text.newTitle : this.text.editTitle,
    });
  }
}
