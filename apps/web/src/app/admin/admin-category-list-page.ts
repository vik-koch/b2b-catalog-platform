import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminCategory } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { AdminCatalogService } from './admin-catalog.service';
import { CategoryDeleteDialog } from './category-delete-dialog';
import { CategoryTreeNode, flattenCategoryTree } from './category-tree';

/**
 * Admin category management: the category tree with add/delete and sibling
 * reordering (move up/down). Editing a category (name, parent, slug, image,
 * description) is its own screen — the pencil links to
 * `/admin/categories/:slug/edit` — so structure lives here and presentation
 * lives on the editor page, each with its own save semantics. Deletion is
 * guarded server-side — a category with products or subcategories can't be
 * removed. Reordering goes through the transactional `reorderCategories`
 * endpoint, so a drag-drop UI could replace the buttons later with no API change.
 */
@Component({
  selector: 'app-admin-category-list-page',
  imports: [RouterLink, Button, LucideIcon, CategoryDeleteDialog],
  template: `
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <button appButton type="button" class="gap-2" (click)="addRoot()">
        <app-lucide-icon name="plus" class="h-4 w-4" />
        {{ text.add }}
      </button>
    </div>

    @if (categories.error()) {
      <p class="text-stone-600" role="alert">{{ catalogText.loadError }}</p>
    } @else if (categories.hasValue()) {
      @if (tree().length === 0) {
        <p class="text-stone-600">{{ text.empty }}</p>
      } @else {
        <ul class="divide-y divide-stone-100">
          @for (node of tree(); track node.category.id) {
            <li>
              <div
                class="flex items-center gap-2 py-2"
                [style.paddingLeft.rem]="node.depth * 1.5"
              >
                <span class="flex-1 font-medium text-stone-700">
                  {{ node.category.name }}
                </span>
                <button
                  type="button"
                  class="p-1 text-stone-400 hover:text-ink disabled:opacity-30"
                  [attr.aria-label]="text.moveUp"
                  [disabled]="isFirstSibling(node.category)"
                  (click)="move(node.category, -1)"
                >
                  <app-lucide-icon name="chevron-up" class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="p-1 text-stone-400 hover:text-ink disabled:opacity-30"
                  [attr.aria-label]="text.moveDown"
                  [disabled]="isLastSibling(node.category)"
                  (click)="move(node.category, 1)"
                >
                  <app-lucide-icon name="chevron-down" class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="p-1 text-stone-400 hover:text-primary"
                  [attr.aria-label]="text.addChild"
                  (click)="addChild(node.category)"
                >
                  <app-lucide-icon name="plus" class="h-4 w-4" />
                </button>
                <a
                  [routerLink]="[
                    '/admin/categories',
                    node.category.slug,
                    'edit',
                  ]"
                  class="p-1 text-stone-400 hover:text-primary"
                  [attr.aria-label]="text.edit"
                >
                  <app-lucide-icon name="pencil" class="h-4 w-4" />
                </a>
                <button
                  type="button"
                  class="p-1 text-stone-400 hover:text-red-700"
                  [attr.aria-label]="text.delete"
                  (click)="deletingCategory.set(node.category)"
                >
                  <app-lucide-icon name="trash-2" class="h-4 w-4" />
                </button>
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <p class="text-stone-500" role="status">…</p>
    }

    @if (deletingCategory(); as target) {
      <app-category-delete-dialog
        [slug]="target.slug"
        [name]="target.name"
        (deleted)="onCategoryDeleted()"
        (cancelled)="deletingCategory.set(null)"
      />
    }
  `,
})
export class AdminCategoryListPage {
  private readonly admin = inject(AdminCatalogService);
  protected readonly text = inject(APP_TEXT).adminCategories;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  /** The category whose delete confirmation modal is open, if any. */
  protected readonly deletingCategory = signal<AdminCategory | null>(null);

  protected categories = resource({
    loader: () => this.admin.listCategories(),
  });

  /** Flat depth-first order (by sortOrder then name) for indented rendering. */
  protected readonly tree = computed<CategoryTreeNode[]>(() =>
    flattenCategoryTree(this.categories.value() ?? []),
  );

  protected onCategoryDeleted(): void {
    this.deletingCategory.set(null);
    this.categories.reload();
  }

  protected isFirstSibling(c: AdminCategory): boolean {
    return this.siblings(c.parentId)[0]?.id === c.id;
  }

  protected isLastSibling(c: AdminCategory): boolean {
    const s = this.siblings(c.parentId);
    return s[s.length - 1]?.id === c.id;
  }

  protected async addRoot(): Promise<void> {
    await this.admin.createCategory({
      name: this.text.defaultName,
      parentId: null,
      image: null,
      description: null,
    });
    this.categories.reload();
  }

  protected async addChild(parent: AdminCategory): Promise<void> {
    await this.admin.createCategory({
      name: this.text.defaultName,
      parentId: parent.id,
      image: null,
      description: null,
    });
    this.categories.reload();
  }

  protected async move(c: AdminCategory, direction: -1 | 1): Promise<void> {
    const siblings = this.siblings(c.parentId);
    const index = siblings.findIndex((s) => s.id === c.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    await this.admin.reorderCategories({
      order: siblings.map((s, i) => ({
        id: s.id,
        parentId: s.parentId,
        sortOrder: i,
      })),
    });
    this.categories.reload();
  }

  private siblings(parentId: string | null): AdminCategory[] {
    return (this.categories.value() ?? [])
      .filter((c) => c.parentId === parentId)
      .sort(bySortThenName);
  }
}

const bySortThenName = (a: AdminCategory, b: AdminCategory): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
