import { Component, computed, inject, resource } from '@angular/core';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { EditActions } from '../../../shared/edit-mode/edit-actions';
import { editAwareContent } from '../../../shared/edit-mode/edit-aware-content';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { LoadErrorView } from '../../platform/load-error-view';
import { CatalogService } from '../catalog.service';
import { CategoryChip } from '../ui/category-chip';
import { CategoryChildren } from './ui/category-children';

/** The listing's 15rem column family (PRODUCT_GRID), so categories stand
 * where product cards do; also the grid of a listing's subcategory chips. One
 * column below `sm`: two left a name about twelve characters. */
export const CATEGORY_GRID = `grid gap-5 grid-cols-1
                              max-sm:gap-3
                              sm:grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))]`;

/** The main page's overview (FR-CAT-01): every top-level category as a chip,
 * the first few subcategories named under it. */
@Component({
  selector: 'app-category-index',
  imports: [CategoryChip, CategoryChildren, EditActions, LoadErrorView],
  template: `
    @if (categories.error()) {
      <app-load-error-view [message]="text.loadError" />
    } @else if (shown(); as cats) {
      @if (cats.length) {
        <ul [class]="gridClass">
          @for (cat of cats; track cat.slug) {
            <li class="group relative flex flex-col">
              @if (editControls(); as editText) {
                <app-edit-actions
                  variant="tile"
                  [editLink]="['/admin/categories', cat.slug, 'edit']"
                  [editParams]="editorFrom()"
                  [editLabel]="editText.editCategory"
                />
              }
              <app-category-chip [category]="cat" />
              <!-- Not on a phone: children under each of fifteen full-width
                   chips is a page nobody reaches the end of. -->
              @if (cat.children.length) {
                <app-category-children class="hidden sm:block" [parent]="cat" />
              }
            </li>
          }
        </ul>
      } @else {
        <p class="text-ink-subtle">{{ text.emptyCategories }}</p>
      }
    } @else if (showSkeleton()) {
      <ul [class]="gridClass" aria-hidden="true">
        @for (i of skeletons; track i) {
          <li class="h-16 animate-pulse rounded-xl bg-chip sm:h-24"></li>
        }
      </ul>
    }
  `,
})
export class CategoryIndex {
  private readonly catalog = inject(CatalogService);
  protected readonly text = inject(STOREFRONT_TEXT).catalog;
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly gridClass = CATEGORY_GRID;
  protected readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  protected readonly categories = resource({
    loader: () => this.catalog.getCategoryTree(),
  });

  private readonly content = editAwareContent({
    ready: computed(() => this.categories.hasValue()),
    section: 'editMode',
  });
  protected readonly editControls = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;
  protected readonly shown = computed(() =>
    this.content.ready() ? this.categories.value() : undefined,
  );
}
