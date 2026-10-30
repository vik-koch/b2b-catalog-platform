import { Component, inject, resource, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Page, PageSlug } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { PageEditor } from './page-editor';
import { PageHistory } from './page-history';
import { PageService } from '../../shared/pages/page.service';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import { injectEditorReturn } from '../../shared/edit-mode/editor-return';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';

/**
 * Edit a static page (FR-ADM-03) on its own screen at
 * `/admin/pages/:slug/edit`, mirroring the product and category editors so every
 * edit button on the panel behaves alike. Reached from the panel and from the
 * storefront's edit-mode pencil, and returns to whichever opened it.
 *
 * A page with no row yet is an ordinary starting state, not an error: only the
 * demo seeds content, so on a real deployment every page begins here, empty.
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

  /**
   * The starting point for a page that does not exist yet. The title is
   * pre-filled from the navigation label so the admin edits a named page rather
   * than facing an empty required field; the save adds version 1.
   */
  protected readonly blankPage: Page = {
    version: 0,
    title: inject(SHARED_TEXT).nav[this.slug] ?? '',
    bodyHtml: '',
    consentLabel: null,
    updatedAt: '',
  };

  /** Delayed so a quick load never flashes a skeleton. */
  protected readonly showSkeleton = delayedLoading(this.page.isLoading);

  protected readonly editorDirty = signal(false);
  private navigatingAway = false;
  private readonly close = injectEditorReturn();

  hasUnsavedChanges(): boolean {
    return !this.navigatingAway && this.editorDirty();
  }

  /**
   * Both a save and a cancel end the same way. The editor has already asked
   * about unsaved work by the time it emits, so the flag keeps the route guard
   * from asking a second time.
   */
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
