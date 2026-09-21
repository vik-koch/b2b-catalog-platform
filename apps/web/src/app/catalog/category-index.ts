import { Component, computed, inject, resource } from '@angular/core';
import { EditActions } from '../admin/edit-actions';
import { editAwareContent } from '../admin/edit-aware-content';
import { injectEditorReturnParams } from '../admin/editor-return';
import { APP_TEXT } from '../config/app-text';
import { LoadErrorView } from '../pages/load-error-view';
import { CatalogService } from './catalog.service';
import { CategoryChildren } from './category-children';
import { CategoryChip } from './category-chip';

/**
 * The grid the categories stand in, on the same column family as a listing:
 * tracks are fitted rather than counted, 15rem wide with the 1.25rem gap, so a
 * screen showing five product cards shows five categories in the same places
 * (see PRODUCT_GRID). One column below the viewport's `sm`, where a chip is a
 * full-width row: two columns of a phone leave a name about twelve characters
 * to live in, and every one of them was clipped.
 *
 * Exported because the subcategory navigation of a listing stands in the same
 * grid: a category is drawn the same way wherever it is shown, and that has to
 * include how wide it is drawn.
 */
export const CATEGORY_GRID =
  'grid gap-5 max-sm:gap-3 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))]';

/**
 * Every top-level category as a chip, with the first few of its subcategories
 * named underneath (FR-CAT-01/02) — the main page and the catalogue index draw
 * the same thing, so they draw it from here.
 *
 * A category is a grouping of products rather than a thing in its own right, so
 * it is shown as a chip and not as a card with a picture of one of its
 * products: the mark identifies it, the name says what it is, and the emphasis
 * a photograph would give it belongs to the products themselves.
 *
 * The cells of a row are as tall as the tallest of them, which is what the
 * uniform grid is: a category with one subcategory leaves the space under it
 * empty rather than stretching, and the next row still starts on one line
 * across the page.
 */
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
              <!-- Named only from the sm breakpoint up. On a phone the chip is
                   already a full-width row and the way into the category is
                   one tap away; a list of children under each of fifteen of
                   them is a page nobody reaches the end of. -->
              @if (cat.children.length) {
                <app-category-children class="hidden sm:block" [parent]="cat" />
              }
            </li>
          }
        </ul>
      } @else {
        <p class="text-muted">{{ text.emptyCategories }}</p>
      }
    } @else if (showSkeleton()) {
      <ul [class]="gridClass" aria-hidden="true">
        @for (i of skeletons; track i) {
          <li class="h-16 animate-pulse rounded-xl bg-stone-125 sm:h-24"></li>
        }
      </ul>
    }
  `,
})
export class CategoryIndex {
  private readonly catalog = inject(CatalogService);
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly gridClass = CATEGORY_GRID;
  protected readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  protected readonly categories = resource({
    loader: () => this.catalog.getCategoryTree(),
  });

  /** The chips and the edit affordances appear together, once the tree and the
   * visitor's role are both known — see editAwareContent. */
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
