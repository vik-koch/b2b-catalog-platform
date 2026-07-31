import { Component, inject, resource, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PageSlug } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { usePageSeo } from '../../core/page-seo';
import { delayedLoading } from '../../core/delayed-loading';
import { PageEditor } from './page-editor';
import { PageService } from '../../pages/page.service';
import { UnsavedChangesAware } from '../../core/unsaved-changes.guard';
import { injectEditorReturn } from '../editor-return';

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
  imports: [PageEditor],
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
    } @else if (page.error()) {
      <p class="text-muted" role="alert">{{ text.saveError }}</p>
    } @else if (showSkeleton()) {
      <div class="animate-pulse space-y-4" aria-hidden="true">
        <div class="h-8 w-1/3 rounded bg-stone-200"></div>
        <div class="h-4 w-full rounded bg-stone-200"></div>
      </div>
    }
  `,
})
export class PageEditorPage implements UnsavedChangesAware {
  private readonly pageService = inject(PageService);
  protected readonly text = inject(ADMIN_TEXT).pageEditor;

  protected readonly slug = (inject(ActivatedRoute).snapshot.paramMap.get(
    'slug',
  ) ?? '') as PageSlug;

  protected readonly page = resource({
    loader: () => this.pageService.getPage(this.slug),
  });

  /**
   * The starting point for a page that does not exist yet. The title is
   * pre-filled from the navigation label so the admin edits a named page rather
   * than facing an empty required field; the save is an upsert either way.
   */
  protected readonly blankPage = {
    title: inject(APP_TEXT).nav[this.slug] ?? '',
    bodyHtml: '',
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
    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
    usePageSeo({
      name: () =>
        this.page.value() === null ? this.text.newTitle : this.text.editTitle,
    });
  }
}
