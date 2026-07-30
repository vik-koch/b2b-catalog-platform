import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminCategory } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { AdminCatalogService } from './admin-catalog.service';
import { CategoryDeleteDialog } from './category-delete-dialog';
import { buildCategoryTree, CategoryTreeBranch } from './category-tree';

/**
 * Admin category management: the category tree with add/delete and sibling
 * reordering by CDK drag-drop. Editing a category (name, parent, slug, image,
 * description) is its own screen — the pencil links to
 * `/admin/categories/:slug/edit` — so structure lives here and presentation
 * lives on the editor page, each with its own save semantics. Deletion is
 * guarded server-side — a category with products or subcategories can't be
 * removed. Each sibling group is its own drop list (drops stay within a group),
 * so a drop reorders siblings and commits through the transactional
 * `reorderCategories` endpoint — reparenting is out of scope here.
 */
@Component({
  selector: 'app-admin-category-list-page',
  imports: [
    RouterLink,
    Button,
    LucideIcon,
    CategoryDeleteDialog,
    CdkDropList,
    CdkDrag,
    NgTemplateOutlet,
  ],
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
        <ng-container
          *ngTemplateOutlet="group; context: { $implicit: tree() }"
        />
      }
    } @else {
      <p class="text-stone-500" role="status">…</p>
    }

    <!-- One drop list per sibling group; recurses for each branch's children. -->
    <ng-template #group let-branches>
      <ul
        cdkDropList
        [cdkDropListData]="branches"
        (cdkDropListDropped)="onDrop($event)"
        class="divide-y divide-stone-100"
      >
        @for (branch of branches; track branch.category.id) {
          <li cdkDrag [cdkDragData]="branch">
            <div class="flex items-center gap-2 py-2">
              <span
                cdkDragHandle
                class="cursor-grab p-1 text-stone-300 hover:text-stone-500 active:cursor-grabbing"
                [attr.aria-label]="text.reorder"
              >
                <app-lucide-icon name="grip-vertical" class="h-4 w-4" />
              </span>
              <span class="flex-1 font-medium text-stone-700">
                {{ branch.category.name }}
              </span>
              <button
                type="button"
                class="p-1 text-stone-400 hover:text-primary"
                [attr.aria-label]="text.addChild"
                (click)="addChild(branch.category)"
              >
                <app-lucide-icon name="plus" class="h-4 w-4" />
              </button>
              <a
                [routerLink]="[
                  '/admin/categories',
                  branch.category.slug,
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
                (click)="deletingCategory.set(branch.category)"
              >
                <app-lucide-icon name="trash-2" class="h-4 w-4" />
              </button>
            </div>
            @if (branch.children.length > 0) {
              <div class="pl-6">
                <ng-container
                  *ngTemplateOutlet="
                    group;
                    context: { $implicit: branch.children }
                  "
                />
              </div>
            }
          </li>
        }
      </ul>
    </ng-template>

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

  /** Nested branches (by sortOrder then name) for the drag-drop tree. */
  protected readonly tree = computed<CategoryTreeBranch[]>(() =>
    buildCategoryTree(this.categories.value() ?? []),
  );

  protected onCategoryDeleted(): void {
    this.deletingCategory.set(null);
    this.categories.reload();
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

  /** A drop within a sibling group: reorder and persist that group's order. */
  protected async onDrop(
    event: CdkDragDrop<CategoryTreeBranch[]>,
  ): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const siblings = event.container.data;
    moveItemInArray(siblings, event.previousIndex, event.currentIndex);
    await this.admin.reorderCategories({
      order: siblings.map((branch, i) => ({
        id: branch.category.id,
        parentId: branch.category.parentId,
        sortOrder: i,
      })),
    });
    this.categories.reload();
  }
}
