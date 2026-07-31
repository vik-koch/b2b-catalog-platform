import { Component, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageSlug } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../config/admin-text';
import { delayedLoading } from '../core/delayed-loading';
import { PageEditor } from '../pages/page-editor';
import { PageService } from '../pages/page.service';
import { UnsavedChangesAware } from '../pages/unsaved-changes.guard';

/**
 * Edit a static page (FR-ADM-03) on its own screen at
 * `/admin/pages/:slug/edit`, mirroring the product and category editors so the
 * panel's six edit buttons all behave alike. It hosts the same PageEditor the
 * storefront's edit-mode pencil opens inline — this route is the second entry
 * point, not a second editor — and returns to the panel when the admin is done.
 */
@Component({
  selector: 'app-admin-page-editor-page',
  imports: [PageEditor],
  template: `
    @if (page.value(); as content) {
      <app-page-editor
        [slug]="slug"
        [page]="content"
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
export class AdminPageEditorPage implements UnsavedChangesAware {
  private readonly pageService = inject(PageService);
  private readonly router = inject(Router);
  protected readonly text = inject(ADMIN_TEXT).pageEditor;

  protected readonly slug = (inject(ActivatedRoute).snapshot.paramMap.get(
    'slug',
  ) ?? '') as PageSlug;

  protected readonly page = resource({
    loader: () => this.pageService.getPage(this.slug),
  });

  /** Delayed so a quick load never flashes a skeleton. */
  protected readonly showSkeleton = delayedLoading(this.page.isLoading);

  protected readonly editorDirty = signal(false);
  private navigatingAway = false;

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
    void this.router.navigate(['/admin']);
  }
}
