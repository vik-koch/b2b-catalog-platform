import {
  CdkDrag,
  CdkDragEnd,
  CdkDragMove,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import {
  AdminCategory,
  CategoryOrderEntry,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { CategoriesService } from './categories.service';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { UnpublishedCount } from '../products/unpublished-count';
import { CategoryDeleteDialog } from './category-delete-dialog';
import {
  CategoryDropTarget,
  CategoryTreeNode,
  categorySubtreeIds,
  currentOrderEntries,
  flattenCategoryTree,
  isNoOpDropTarget,
  moveCategoryEntries,
  resolveDropTarget,
} from './category-tree';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { rotateCcwIcon } from '@b2b-catalog-platform/ui/icons/glyphs/rotate-ccw';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';
import { DragGrip } from '../ui/drag-grip';

/** Pixels per tree level, for the rows and the drop line alike. */
const INDENT = 24;

/** How far past the list's top and bottom edge still counts as a drop. */
const EDGE_SLACK = 24;

/**
 * The category tree: add, delete, and move by drag (FR-ADM-01). One flat drop
 * list with the CDK's sorting off, so nothing shifts under the pointer; an
 * insertion line, indented to the level the row would land at, is the only
 * feedback. A drop is the save, so each move goes onto an undo stack instead
 * (the button, or ctrl/cmd+z).
 */
@Component({
  selector: 'app-category-list-page',
  imports: [
    DragGrip,
    PageHeader,
    RouterLink,
    Button,
    IconButton,
    Icon,
    Link,
    RecordRow,
    CategoryDeleteDialog,
    CdkDropList,
    CdkDrag,
    Skeleton,
    UnpublishedCount,
    ErrorText,
  ],
  styles: `
    .cdk-drag-placeholder {
      opacity: 0.4;
    }

    /* Translucent: it sits over the drop line, and as a popover in the top
       layer no z-index can put it behind. */
    .cdk-drag-preview {
      border-radius: 0.375rem;
      background: rgb(255 255 255 / 0.65);
      box-shadow:
        0 10px 15px -3px rgb(0 0 0 / 0.1),
        0 4px 6px -4px rgb(0 0 0 / 0.1);
    }

    /* The clone's indent would cover the place the line is drawn. */
    .cdk-drag-preview > div {
      margin-left: 0 !important;
      border-top: 0 !important;
    }
  `,
  template: `
    <ui-page-header [title]="text.page.title">
      <a
        uiButton
        variant="secondary"
        routerLink="/admin/catalog/filters"
        [queryParams]="editorFrom()"
        class="gap-2"
      >
        <ui-icon [glyph]="funnelIcon" class="size-4" />
        {{ text.catalogFilters }}
      </a>
      <a
        uiButton
        routerLink="/admin/categories/new"
        [queryParams]="editorFrom()"
        class="gap-2"
      >
        <ui-icon [glyph]="plusIcon" class="size-4" />
        {{ text.add }}
      </a>
    </ui-page-header>

    <div class="max-w-3xl">
      <!-- Undo is always drawn, inert until there is a move to undo, so
           nothing shifts the moment a drop lands. -->
      <div class="mb-4 flex min-h-8 items-start justify-between gap-4">
        <p class="text-sm text-ink-subtle">{{ text.reorderHint }}</p>
        <button
          uiIconButton
          type="button"
          class="shrink-0 mr-1"
          [class.opacity-40]="!canUndo()"
          [disabled]="!canUndo()"
          [attr.aria-label]="text.undo"
          [title]="text.undo"
          (click)="undo()"
        >
          <ui-icon [glyph]="rotateCcwIcon" />
        </button>
      </div>

      @if (reorderError()) {
        <p uiErrorText class="mb-4" role="alert">
          {{ text.reorderError }}
        </p>
      }

      @if (categories.error()) {
        <p class="text-ink-subtle" role="alert">{{ adminText.loadError }}</p>
      } @else if (categories.hasValue()) {
        @if (rows().length === 0) {
          <p class="text-ink-subtle">{{ text.empty }}</p>
        } @else {
          <div class="relative">
            <ul
              #list
              cdkDropList
              cdkDropListSortingDisabled
              [cdkDropListDisabled]="busy()"
            >
              @for (
                node of rows();
                track node.category.id;
                let first = $first
              ) {
                <li
                  cdkDrag
                  [cdkDragData]="node"
                  [class.opacity-40]="draggedSubtreeIds().has(node.category.id)"
                  (cdkDragStarted)="dragging.set(node)"
                  (cdkDragMoved)="onDragMoved($event)"
                  (cdkDragEnded)="onDragEnded($event)"
                >
                  <div
                    class="border-edge py-3"
                    [class]="depthTint(node.depth)"
                    [class.border-t]="!first"
                    [style.marginLeft.px]="node.depth * indent"
                  >
                    <ui-record-row [compact]="true">
                      <app-drag-grip recordControl size="lead" />
                      <!-- Wraps rather than truncating: the name is what the
                           tree is scanned for. Greyed where the storefront
                           leaves it out (FR-ADM-19). -->
                      <a
                        class="wrap-break-word font-medium text-ink
                               hover:text-accent"
                        [class.opacity-50]="!node.category.liveProductCount"
                        [routerLink]="['/catalog', node.category.slug]"
                        [title]="text.seeProducts"
                      >
                        {{ node.category.name }}
                      </a>
                      <ng-container recordMeta>
                        @if (node.category.productCount) {
                          <a
                            uiLink
                            routerLink="/admin/products"
                            [queryParams]="{ categoryId: node.category.id }"
                            [title]="text.editProducts"
                          >
                            {{ productsLabel(node.category.productCount) }}
                          </a>
                          <app-unpublished-count
                            [count]="
                              node.category.productCount -
                              node.category.liveProductCount
                            "
                            [query]="{ categoryId: node.category.id }"
                          />
                        } @else {
                          <span>{{ text.noProducts }}</span>
                        }
                        <!-- Filed in the parent itself, hidden in the count
                             above; a leaf would only repeat that count. -->
                        @if (
                          node.category.childCount &&
                          node.category.directProductCount
                        ) {
                          <a
                            uiLink
                            routerLink="/admin/products"
                            [queryParams]="{
                              categoryId: node.category.id,
                              categoryScope: 'direct',
                            }"
                            [title]="text.editProducts"
                          >
                            {{
                              directProductsLabel(
                                node.category.directProductCount
                              )
                            }}
                          </a>
                        }
                        @if (!node.category.liveProductCount) {
                          <span class="text-ink-subtle">{{
                            text.notShown
                          }}</span>
                        }
                      </ng-container>
                      <ng-container recordActions>
                        <a
                          uiIconButton
                          routerLink="/admin/categories/new"
                          [queryParams]="{
                            parent: node.category.slug,
                            from: editorFrom().from,
                          }"
                          [attr.aria-label]="text.addChild"
                          [title]="text.addChild"
                        >
                          <ui-icon [glyph]="plusIcon" />
                        </a>
                        <a
                          uiIconButton
                          [routerLink]="[
                            '/admin/categories',
                            node.category.slug,
                            'filters',
                          ]"
                          [queryParams]="editorFrom()"
                          [attr.aria-label]="text.editFilters"
                          [title]="text.editFilters"
                        >
                          <ui-icon [glyph]="funnelIcon" />
                        </a>
                        <a
                          uiIconButton
                          [routerLink]="[
                            '/admin/categories',
                            node.category.slug,
                            'edit',
                          ]"
                          [queryParams]="editorFrom()"
                          [attr.aria-label]="adminText.actions.edit"
                          [title]="adminText.actions.edit"
                        >
                          <ui-icon [glyph]="pencilIcon" />
                        </a>
                        <button
                          uiIconButton
                          variant="danger"
                          type="button"
                          [attr.aria-label]="adminText.actions.delete"
                          [title]="adminText.actions.delete"
                          (click)="deletingCategory.set(node.category)"
                        >
                          <ui-icon [glyph]="trash2Icon" />
                        </button>
                      </ng-container>
                    </ui-record-row>
                  </div>
                </li>
              }
            </ul>

            <!-- The only drop feedback: where the row lands, at what level. -->
            @if (line(); as l) {
              <div
                class="pointer-events-none absolute right-0 h-[3px]
                       rounded-full bg-primary"
                [style.top.px]="l.top"
                [style.left.px]="l.left"
              >
                <span
                  class="absolute top-[-3px] left-0 size-[9px]
                         -translate-x-1/2 rounded-full bg-primary"
                ></span>
              </div>
            }
          </div>
        }
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="5" />
      }

      @if (deletingCategory(); as target) {
        <app-category-delete-dialog
          [slug]="target.slug"
          [name]="target.name"
          (deleted)="onCategoryDeleted()"
          (cancelled)="deletingCategory.set(null)"
        />
      }
    </div>
  `,
})
export class CategoryListPage {
  protected readonly funnelIcon = funnelIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly rotateCcwIcon = rotateCcwIcon;
  protected readonly trash2Icon = trash2Icon;
  private readonly service = inject(CategoriesService);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).categories.list;
  private readonly productsText = inject(ADMIN_TEXT).products;
  protected readonly editorFrom = injectEditorReturnParams();

  protected productsLabel(count: number): string {
    return fillText(this.productsText.count, { count });
  }

  protected directProductsLabel(count: number): string {
    return fillText(this.text.directProducts, { count });
  }

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  protected readonly indent = INDENT;

  /**
   * The indent alone reads only against the row above. One tint for every
   * level: a darker one takes the accent and amber text below 4.5:1.
   */
  protected depthTint(depth: number): string {
    return depth > 0 ? 'bg-surface pl-2' : '';
  }

  protected readonly deletingCategory = signal<AdminCategory | null>(null);

  protected readonly dragging = signal<CategoryTreeNode | null>(null);

  private readonly dropTarget = signal<CategoryDropTarget | null>(null);
  protected readonly line = signal<{ top: number; left: number } | null>(null);

  /** The list is frozen while a reorder is in flight. */
  protected readonly busy = signal(false);
  protected readonly reorderError = signal(false);

  /** One entry per committed move, newest last: the moved groups as stored. */
  private readonly undoStack = signal<CategoryOrderEntry[][]>([]);
  protected readonly canUndo = computed(
    () => this.undoStack().length > 0 && !this.busy(),
  );

  protected readonly categories = resource({
    loader: () => this.service.list(),
  });
  protected readonly showSkeleton = delayedLoading(this.categories.isLoading);

  /** Greyed while the drag runs, and no place to land: a category cannot go
   * inside itself. */
  protected readonly draggedSubtreeIds = computed<Set<string>>(() => {
    const dragged = this.dragging();
    return dragged
      ? categorySubtreeIds(this.categories.value() ?? [], dragged.category.id)
      : new Set();
  });

  protected readonly rows = computed<CategoryTreeNode[]>(() =>
    flattenCategoryTree(this.categories.value() ?? []),
  );

  protected onCategoryDeleted(): void {
    this.deletingCategory.set(null);
    // Undo entries name categories by id; a deleted one would fail the whole
    // replay, so the history goes with it.
    this.undoStack.set([]);
    this.categories.reload();
  }

  protected onDragMoved(event: CdkDragMove<CategoryTreeNode>): void {
    const listEl = this.list()?.nativeElement;
    const dragged = this.dragging();
    if (!listEl || !dragged) return;

    const listBox = listEl.getBoundingClientRect();
    const { x, y } = event.pointerPosition;
    if (!this.isInsideList(event.pointerPosition)) {
      this.clearTarget();
      return;
    }

    // Read per move, not cached: an auto-scrolling drag moves the rows.
    const boxes = Array.from(
      listEl.querySelectorAll<HTMLElement>(':scope > li'),
    ).map((li) => li.getBoundingClientRect());

    // The gap is however many row midpoints the pointer has passed.
    let gap = boxes.length;
    for (let i = 0; i < boxes.length; i++) {
      if (y < boxes[i].top + boxes[i].height / 2) {
        gap = i;
        break;
      }
    }

    const excluded = this.draggedSubtreeIds();
    const rows = this.rows();
    const remaining = rows.filter((r) => !excluded.has(r.category.id));
    const gapInRemaining = rows
      .slice(0, gap)
      .filter((r) => !excluded.has(r.category.id)).length;

    const desiredDepth = Math.floor((x - listBox.left) / INDENT);
    const target = resolveDropTarget(remaining, gapInRemaining, desiredDepth);

    const categories = this.categories.value() ?? [];
    if (isNoOpDropTarget(categories, dragged.category.id, target)) {
      this.clearTarget();
      return;
    }
    this.dropTarget.set(target);

    // On the gap's edge among the remaining rows, not the rendered ones: they
    // differ around the dragged subtree, and the line marks where it lands.
    const boxOf = new Map(rows.map((r, i) => [r.category.id, boxes[i]]));
    const above = remaining[gapInRemaining - 1];
    const below = remaining[gapInRemaining];
    const aboveBox = above && boxOf.get(above.category.id);
    const belowBox = below && boxOf.get(below.category.id);
    const edge = aboveBox ? aboveBox.bottom : belowBox?.top;
    if (edge === undefined) {
      this.clearTarget();
      return;
    }
    this.line.set({
      top: edge - listBox.top,
      left: target.depth * INDENT,
    });
  }

  /** Commits on `ended`, not the list's `dropped`: the CDK emits `ended` first,
   * so what it clears would be gone by then. */
  protected onDragEnded(event: CdkDragEnd): void {
    const dragged = this.dragging();
    const target = this.dropTarget();
    this.dragging.set(null);
    this.clearTarget();
    if (!dragged || !target) return;

    // Moves arrive per animation frame, so the target may predate a release
    // outside the list: the release point decides.
    if (!this.isInsideList(event.dropPoint)) return;

    const categories = this.categories.value() ?? [];
    const order = moveCategoryEntries(categories, dragged.category.id, target);
    if (order.length === 0) return;

    const previous = currentOrderEntries(
      categories,
      order.map((entry) => entry.id),
    );
    void this.persist(order, previous);
  }

  private isInsideList(point: { x: number; y: number }): boolean {
    const box = this.list()?.nativeElement.getBoundingClientRect();
    if (!box) return false;
    return (
      point.y >= box.top - EDGE_SLACK &&
      point.y <= box.bottom + EDGE_SLACK &&
      point.x >= box.left &&
      point.x <= box.right
    );
  }

  private clearTarget(): void {
    this.dropTarget.set(null);
    this.line.set(null);
  }

  protected async undo(): Promise<void> {
    const stack = this.undoStack();
    const previous = stack.at(-1);
    if (!previous || this.busy()) return;
    this.undoStack.set(stack.slice(0, -1));
    await this.persist(previous, null);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'z' || !(event.ctrlKey || event.metaKey)) return;
    if (event.shiftKey || this.undoStack().length === 0) return;
    event.preventDefault();
    void this.undo();
  }

  /** On failure nothing was written; the reload makes sure of what shows. */
  private async persist(
    order: CategoryOrderEntry[],
    previous: CategoryOrderEntry[] | null,
  ): Promise<void> {
    this.busy.set(true);
    this.reorderError.set(false);
    try {
      this.categories.set(await this.service.reorder({ order }));
      if (previous) this.undoStack.update((stack) => [...stack, previous]);
    } catch {
      this.reorderError.set(true);
      this.categories.reload();
    } finally {
      this.busy.set(false);
    }
  }

  constructor() {
    usePageSeo({ name: () => this.text.page.title });
  }
}
