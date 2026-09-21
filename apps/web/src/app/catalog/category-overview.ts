import { Component, inject, signal } from '@angular/core';
import { EditActions } from '../admin/edit-actions';
import { editAwareContent } from '../admin/edit-aware-content';
import { injectEditorReturnParams } from '../admin/editor-return';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';
import { CategoryIndex } from './category-index';

/**
 * The catalogue landing view (FR-CAT-01/02): the whole catalogue in one screen
 * — every top-level category as a chip with the first of its subcategories
 * named under it (see CategoryIndex).
 *
 * The main page shows the same index. What makes this one the index is the
 * heading and the intro above it; once the main page carries a featured row of
 * products the two will be worth telling apart again.
 */
@Component({
  selector: 'app-category-overview',
  imports: [CategoryIndex, EditActions],
  template: `
    <section class="relative pb-12 sm:pb-16">
      @if (editControls(); as editText) {
        <app-edit-actions
          [editLink]="['/admin/categories']"
          [editLabel]="editText.editCategories"
          [addCategoryLink]="['/admin/categories/new']"
          [addCategoryParams]="editorFrom()"
          [addCategoryLabel]="editText.addCategory"
        />
      }
      <h1 class="text-3xl font-medium tracking-tight">
        {{ text.overviewTitle }}
      </h1>
      <p class="mt-2 max-w-xl text-lg text-muted">
        {{ text.overviewIntro }}
      </p>

      <app-category-index class="mt-4 block" />
    </section>
  `,
})
export class CategoryOverview {
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly editorFrom = injectEditorReturnParams();

  /** The page's own controls — a way into the category admin, and adding a
   * top-level category. The per-category ones live with the chips. */
  private readonly content = editAwareContent({
    ready: signal(true),
    section: 'editMode',
  });
  protected readonly editControls = this.content.controls;

  constructor() {
    usePageSeo({
      name: () => this.text.overviewTitle,
      description: () => this.text.overviewIntro,
    });
  }
}
