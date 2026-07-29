import { Component, computed, inject, resource, signal } from '@angular/core';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  AdminCategory,
  CatalogImage,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { AdminCatalogService } from './admin-catalog.service';
import { MediaService } from './media.service';

interface TreeNode {
  category: AdminCategory;
  depth: number;
}

/**
 * Admin category management: the category tree with add/rename/delete,
 * sibling reordering (move up/down) and reparenting (a parent selector),
 * plus each category's presentation overlay (image, description). Deletion is
 * guarded server-side — a category with products or subcategories can't be
 * removed. Reordering goes through the transactional `reorderCategories`
 * endpoint, so a drag-drop UI could replace the buttons later with no API change.
 */
@Component({
  selector: 'app-admin-category-list-page',
  imports: [Button, LucideIcon],
  template: `
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <button appButton type="button" class="gap-2" (click)="addRoot()">
        <app-lucide-icon name="plus" class="h-4 w-4" />
        {{ text.add }}
      </button>
    </div>

    @if (error()) {
      <p class="mb-4 text-sm text-red-700" role="alert">{{ error() }}</p>
    }

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
                <button
                  type="button"
                  class="p-1 text-stone-400 hover:text-primary"
                  [attr.aria-label]="text.edit"
                  (click)="toggleEdit(node.category)"
                >
                  <app-lucide-icon name="pencil" class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="p-1 text-stone-400 hover:text-red-700 disabled:opacity-30"
                  [attr.aria-label]="text.delete"
                  [attr.title]="
                    hasContents(node.category) ? text.deleteBlocked : null
                  "
                  [disabled]="hasContents(node.category)"
                  (click)="remove(node.category)"
                >
                  <app-lucide-icon name="trash-2" class="h-4 w-4" />
                </button>
              </div>

              @if (expandedId() === node.category.id) {
                <div
                  class="mb-3 space-y-4 rounded-md bg-stone-50 p-4"
                  [style.marginLeft.rem]="node.depth * 1.5"
                >
                  <label class="block">
                    <span class="mb-1 block text-sm font-medium">{{
                      productText.name
                    }}</span>
                    <input
                      type="text"
                      class="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-primary focus:outline-none"
                      [value]="editName()"
                      (input)="editName.set($any($event.target).value)"
                    />
                  </label>

                  <label class="block">
                    <span class="mb-1 block text-sm font-medium">{{
                      text.parent
                    }}</span>
                    <select
                      class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 focus:border-primary focus:outline-none"
                      (change)="editParent.set($any($event.target).value)"
                    >
                      <option value="" [selected]="editParent() === ''">
                        {{ text.noParent }}
                      </option>
                      @for (opt of parentOptions(node.category); track opt.id) {
                        <option
                          [value]="opt.id"
                          [selected]="opt.id === editParent()"
                        >
                          {{ opt.name }}
                        </option>
                      }
                    </select>
                  </label>

                  <label class="block">
                    <span class="mb-1 block text-sm font-medium">{{
                      productText.slug
                    }}</span>
                    <input
                      type="text"
                      class="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
                      [value]="editSlug()"
                      (input)="editSlug.set($any($event.target).value)"
                    />
                  </label>

                  <label class="block">
                    <span class="mb-1 block text-sm font-medium">{{
                      productText.description
                    }}</span>
                    <textarea
                      rows="3"
                      class="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-primary focus:outline-none"
                      [value]="editDescription()"
                      (input)="editDescription.set($any($event.target).value)"
                    ></textarea>
                  </label>

                  <div>
                    <span class="mb-1 block text-sm font-medium">{{
                      text.image
                    }}</span>
                    <div class="flex items-center gap-3">
                      @if (editImage(); as img) {
                        <img
                          [src]="img.thumb"
                          alt=""
                          class="h-16 w-16 rounded border border-stone-200 object-cover"
                        />
                        <button
                          appButton
                          variant="secondary"
                          type="button"
                          (click)="editImage.set(null)"
                        >
                          {{ text.removeImage }}
                        </button>
                      } @else {
                        <input
                          #imageInput
                          type="file"
                          class="hidden"
                          [accept]="accept"
                          (change)="onImage($event)"
                        />
                        <button
                          appButton
                          variant="secondary"
                          type="button"
                          class="gap-2"
                          [disabled]="uploading()"
                          (click)="imageInput.click()"
                        >
                          <app-lucide-icon name="image-plus" class="h-4 w-4" />
                          {{ uploading() ? text.uploading : text.image }}
                        </button>
                      }
                    </div>
                  </div>

                  <div class="flex gap-2">
                    <button
                      appButton
                      type="button"
                      class="gap-2"
                      [disabled]="saving()"
                      (click)="save(node.category)"
                    >
                      <app-lucide-icon name="save" class="h-4 w-4" />
                      {{ saving() ? productText.saving : productText.save }}
                    </button>
                    <button
                      appButton
                      variant="secondary"
                      type="button"
                      (click)="expandedId.set(null)"
                    >
                      {{ text.done }}
                    </button>
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      }
    } @else {
      <p class="text-stone-500" role="status">…</p>
    }
  `,
})
export class AdminCategoryListPage {
  private readonly admin = inject(AdminCatalogService);
  private readonly media = inject(MediaService);
  protected readonly text = inject(APP_TEXT).adminCategories;
  protected readonly productText = inject(APP_TEXT).productEditor;
  protected readonly catalogText = inject(APP_TEXT).catalog;
  protected readonly accept = ACCEPTED_IMAGE_MIME_TYPES.join(',');

  protected readonly expandedId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);

  // Edit-form state for the expanded category.
  protected readonly editName = signal('');
  protected readonly editSlug = signal('');
  protected readonly editParent = signal('');
  protected readonly editDescription = signal('');
  protected readonly editImage = signal<CatalogImage | null>(null);

  protected categories = resource({
    loader: () => this.admin.listCategories(),
  });

  /** Flat depth-first order (by sortOrder then name) for indented rendering. */
  protected readonly tree = computed<TreeNode[]>(() => {
    const all = this.categories.value() ?? [];
    const byParent = new Map<string | null, AdminCategory[]>();
    for (const c of all) {
      const list = byParent.get(c.parentId) ?? [];
      list.push(c);
      byParent.set(c.parentId, list);
    }
    for (const list of byParent.values()) list.sort(bySortThenName);
    const out: TreeNode[] = [];
    const walk = (parentId: string | null, depth: number): void => {
      for (const c of byParent.get(parentId) ?? []) {
        out.push({ category: c, depth });
        walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  protected hasContents(c: AdminCategory): boolean {
    return c.productCount > 0 || c.childCount > 0;
  }

  protected isFirstSibling(c: AdminCategory): boolean {
    return this.siblings(c.parentId)[0]?.id === c.id;
  }

  protected isLastSibling(c: AdminCategory): boolean {
    const s = this.siblings(c.parentId);
    return s[s.length - 1]?.id === c.id;
  }

  /** Parents a category may move under: everyone except itself and its
   * descendants (which would form a cycle). */
  protected parentOptions(c: AdminCategory): AdminCategory[] {
    const banned = this.descendants(c.id);
    banned.add(c.id);
    return (this.categories.value() ?? [])
      .filter((o) => !banned.has(o.id))
      .sort(bySortThenName);
  }

  protected toggleEdit(c: AdminCategory): void {
    if (this.expandedId() === c.id) {
      this.expandedId.set(null);
      return;
    }
    this.editName.set(c.name);
    this.editSlug.set(c.slug);
    this.editParent.set(c.parentId ?? '');
    this.editDescription.set(c.description ?? '');
    this.editImage.set(c.image);
    this.error.set(null);
    this.expandedId.set(c.id);
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

  protected async save(c: AdminCategory): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.admin.updateCategory(c.id, {
        name: this.editName().trim() || this.text.defaultName,
        parentId: this.editParent() || null,
        description: this.editDescription().trim() || null,
        image: this.editImage(),
        ...(this.editSlug().trim() ? { slug: this.editSlug().trim() } : {}),
      });
      this.expandedId.set(null);
      this.categories.reload();
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(c: AdminCategory): Promise<void> {
    const ok = await this.admin.deleteCategory(c.id);
    if (ok) {
      if (this.expandedId() === c.id) this.expandedId.set(null);
      this.categories.reload();
    } else {
      this.error.set(this.text.deleteBlocked);
    }
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

  protected async onImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      this.editImage.set(await this.media.uploadCatalogImage(file));
    } catch {
      this.error.set(this.text.uploadError);
    } finally {
      this.uploading.set(false);
    }
  }

  private siblings(parentId: string | null): AdminCategory[] {
    return (this.categories.value() ?? [])
      .filter((c) => c.parentId === parentId)
      .sort(bySortThenName);
  }

  private descendants(id: string): Set<string> {
    const all = this.categories.value() ?? [];
    const out = new Set<string>();
    const walk = (parentId: string): void => {
      for (const c of all) {
        if (c.parentId === parentId && !out.has(c.id)) {
          out.add(c.id);
          walk(c.id);
        }
      }
    };
    walk(id);
    return out;
  }
}

const bySortThenName = (a: AdminCategory, b: AdminCategory): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
