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
import {
  AdminCategory,
  CategoryOrderEntry,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { usePageSeo } from '../../core/page-seo';
import { Skeleton } from '../../ui/skeleton';
import { delayedLoading } from '../../core/delayed-loading';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { AdminCatalogService } from '../admin-catalog.service';
import { injectEditorReturnParams } from '../editor-return';
import { CategoryDeleteDialog } from './category-delete-dialog';
import {
  CategoryDropTarget,
  categoryDescendantIds,
  CategoryTreeNode,
  currentOrderEntries,
  flattenCategoryTree,
  isNoOpDropTarget,
  moveCategoryEntries,
  resolveDropTarget,
} from './category-tree';

/** Pixels of indent per tree level, shared by the rows and the drop line. */
const INDENT = 36;

/** How far past the list's top and bottom edge still counts as a drop. */
const EDGE_SLACK = 24;

/**
 * Admin category management: the category tree with add/delete, and reordering
 * and reparenting by drag-drop. Editing a category (name, parent, slug, image,
 * description) is its own screen — the pencil links to
 * `/admin/categories/:slug/edit` — so structure lives here and presentation
 * lives on the editor page, each with its own save semantics. Deletion is
 * guarded server-side — a category with products or subcategories can't be
 * removed.
 *
 * The tree renders flat, one row per category indented by depth, as a single
 * drop list with the CDK's own sorting switched off: nothing rearranges under
 * the pointer, and the only feedback is an insertion line drawn where the row
 * would land. The line's indent is the level it would land at — a gap accepts
 * any depth between the row below it and one inside the row above, and the
 * pointer's horizontal position picks from that range, so aiming right at the
 * gap under a leaf makes the dragged category its first child.
 *
 * Every drop commits immediately through the transactional `reorderCategories`
 * endpoint, which applies the whole posted set at once; a move posts the sibling
 * groups it touched. There is no save/cancel here because the drop gesture is
 * the commit — instead each move pushes the previous placement onto an undo
 * stack, replayable with the button or ctrl/cmd+z.
 */
@Component({
  selector: 'app-category-list-page',
  imports: [
    RouterLink,
    Button,
    AdminIcon,
    CategoryDeleteDialog,
    CdkDropList,
    CdkDrag,
    Skeleton,
  ],
  styles: `
    /* Both of these are the CDK's clone of the row, so they carry its exact
       height and type; they only need the states drawn on top. */
    .cdk-drag-placeholder {
      opacity: 0.4;
    }

    /* Translucent, because the preview follows the pointer and so sits right
       over the drop line it is meant to be read against. It cannot simply be
       put behind the line: the CDK renders it as a popover, which lives in the
       top layer, above anything a z-index can reach. */
    .cdk-drag-preview {
      border-radius: 0.375rem;
      background: rgb(255 255 255 / 0.65);
      box-shadow:
        0 10px 15px -3px rgb(0 0 0 / 0.1),
        0 4px 6px -4px rgb(0 0 0 / 0.1);
    }

    /* The clone keeps the row's indent and divider, which on a nested category
       is an empty gutter of preview covering the very place the line is drawn. */
    .cdk-drag-preview > div {
      margin-left: 0 !important;
      border-top: 0 !important;
    }
  `,
  template: `
    <div class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <a
        appButton
        routerLink="/admin/categories/new"
        [queryParams]="editorFrom()"
        class="gap-2"
      >
        <app-admin-icon name="plus" class="h-4 w-4" />
        {{ text.add }}
      </a>
    </div>

    <!-- Narrower than the heading above it: everything below is a column of
         fields and rows to read down, not a table to scan across, and a line
         that runs the full width of a desktop is a line nobody follows. -->
    <div class="max-w-3xl">
      <div class="mb-4 flex min-h-8 items-center justify-between gap-4">
        <p class="text-sm text-muted">{{ text.reorderHint }}</p>
        @if (undoStack().length > 0) {
          <button
            appButton
            variant="ghost"
            size="sm"
            type="button"
            class="gap-2"
            [disabled]="busy()"
            (click)="undo()"
          >
            <app-admin-icon name="rotate-ccw" class="h-4 w-4" />
            {{ text.undo }}
          </button>
        }
      </div>

      @if (reorderError()) {
        <p class="mb-4 text-sm text-red-700" role="alert">
          {{ text.reorderError }}
        </p>
      }

      @if (categories.error()) {
        <p class="text-muted" role="alert">{{ catalogText.loadError }}</p>
      } @else if (categories.hasValue()) {
        @if (rows().length === 0) {
          <p class="text-muted">{{ text.empty }}</p>
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
                  <!-- No custom preview template: the CDK clones this row, which
                     is one row at its real size and type, never its subtree —
                     children are their own rows and stay where they are. -->
                  <div
                    class="flex items-center gap-2 border-stone-100 py-2"
                    [class.border-t]="!first"
                    [style.marginLeft.px]="node.depth * indent"
                  >
                    <span
                      cdkDragHandle
                      class="cursor-grab p-1 text-stone-300 hover:text-subtle active:cursor-grabbing"
                      [attr.aria-label]="common.reorder"
                      [title]="common.reorder"
                    >
                      <app-admin-icon name="grip-vertical" class="h-4 w-4" />
                    </span>
                    <span class="flex-1 font-medium text-stone-700">
                      {{ node.category.name }}
                    </span>
                    <a
                      routerLink="/admin/categories/new"
                      [queryParams]="{
                        parent: node.category.slug,
                        from: editorFrom().from,
                      }"
                      class="p-1 text-stone-400 hover:text-accent"
                      [attr.aria-label]="text.addChild"
                      [title]="text.addChild"
                    >
                      <app-admin-icon name="plus" class="h-4 w-4" />
                    </a>
                    <a
                      [routerLink]="['/catalog', node.category.slug]"
                      class="p-1 text-stone-400 hover:text-accent"
                      [attr.aria-label]="text.seeProducts"
                      [title]="text.seeProducts"
                    >
                      <app-admin-icon name="eye" class="h-4 w-4" />
                    </a>
                    <a
                      routerLink="/admin/products"
                      [queryParams]="{ categoryId: node.category.id }"
                      class="p-1 text-stone-400 hover:text-accent"
                      [attr.aria-label]="text.editProducts"
                      [title]="text.editProducts"
                    >
                      <app-admin-icon name="square-menu" class="h-4 w-4" />
                    </a>
                    <a
                      [routerLink]="[
                        '/admin/categories',
                        node.category.slug,
                        'filters',
                      ]"
                      [queryParams]="editorFrom()"
                      class="p-1 text-stone-400 hover:text-accent"
                      [attr.aria-label]="text.editFilters"
                      [title]="text.editFilters"
                    >
                      <app-admin-icon name="funnel" class="h-4 w-4" />
                    </a>
                    <a
                      [routerLink]="[
                        '/admin/categories',
                        node.category.slug,
                        'edit',
                      ]"
                      [queryParams]="editorFrom()"
                      class="p-1 text-stone-400 hover:text-accent"
                      [attr.aria-label]="text.edit"
                      [title]="text.edit"
                    >
                      <app-admin-icon name="pencil" class="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      class="p-1 text-stone-400 hover:text-red-700"
                      [attr.aria-label]="text.delete"
                      [title]="text.delete"
                      (click)="deletingCategory.set(node.category)"
                    >
                      <app-admin-icon name="trash-2" class="h-4 w-4" />
                    </button>
                  </div>
                </li>
              }
            </ul>

            <!-- The only drop feedback: where the row lands, at what level. -->
            @if (line(); as l) {
              <div
                class="pointer-events-none absolute right-0 h-[3px] rounded-full bg-primary"
                [style.top.px]="l.top"
                [style.left.px]="l.left"
              >
                <span
                  class="absolute -top-[3px] left-0 h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-primary"
                ></span>
              </div>
            }
          </div>
        }
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="5" />
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
  private readonly admin = inject(AdminCatalogService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).categoryList;
  protected readonly catalogText = inject(APP_TEXT).catalog;
  protected readonly editorFrom = injectEditorReturnParams();

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  protected readonly indent = INDENT;

  /** The category whose delete confirmation modal is open, if any. */
  protected readonly deletingCategory = signal<AdminCategory | null>(null);

  /** The row being dragged, while a drag is in progress. */
  protected readonly dragging = signal<CategoryTreeNode | null>(null);

  /** Where the dragged row would land, and the line drawn to say so. */
  private readonly dropTarget = signal<CategoryDropTarget | null>(null);
  protected readonly line = signal<{ top: number; left: number } | null>(null);

  /** Set while a reorder is in flight; the list is frozen until it lands. */
  protected readonly busy = signal(false);
  protected readonly reorderError = signal(false);

  /**
   * Previous placements, newest last — one entry per committed move, holding
   * the affected categories exactly as they were stored beforehand.
   */
  protected readonly undoStack = signal<CategoryOrderEntry[][]>([]);

  protected categories = resource({
    loader: () => this.admin.listCategories(),
  });

  /** Delayed so a quick load never flashes a skeleton. */
  protected readonly showSkeleton = delayedLoading(this.categories.isLoading);

  /**
   * The dragged category and everything under it — greyed out while the drag
   * runs, and excluded from the drop resolution: a category cannot land inside
   * its own subtree, so none of those rows is a place to go.
   */
  protected readonly draggedSubtreeIds = computed<Set<string>>(() => {
    const dragged = this.dragging();
    if (!dragged) return new Set();
    const id = dragged.category.id;
    return new Set([
      id,
      ...categoryDescendantIds(this.categories.value() ?? [], id),
    ]);
  });

  /** The tree flattened to display order, each row carrying its depth. */
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

  /**
   * Track the pointer: pick the gap it is nearest, ask for the depth its
   * horizontal position suggests, and place the line on the result.
   */
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

    // Row boxes are read per move rather than cached at drag start: the list
    // can scroll under an auto-scrolling drag, which would stale a cache.
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

    // Resolve against the tree minus the dragged subtree — it cannot land
    // inside itself, and the remaining rows are what the indices count.
    const excluded = this.draggedSubtreeIds();
    const rows = this.rows();
    const remaining = rows.filter((r) => !excluded.has(r.category.id));
    const gapInRemaining = rows
      .slice(0, gap)
      .filter((r) => !excluded.has(r.category.id)).length;

    const desiredDepth = Math.floor((x - listBox.left) / INDENT);
    const target = resolveDropTarget(remaining, gapInRemaining, desiredDepth);

    // The slot it already occupies is reachable from the gap above its row and
    // from the gap below its subtree; neither is a move, so neither draws.
    const categories = this.categories.value() ?? [];
    if (isNoOpDropTarget(categories, dragged.category.id, target)) {
      this.clearTarget();
      return;
    }
    this.dropTarget.set(target);

    // The line sits on the boundary of the gap *in the remaining rows*, not the
    // rendered ones. Inside the dragged subtree those differ: the pointer may be
    // below the subtree while the target is the slot above it, and the line has
    // to sit where the row will actually appear.
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

  /**
   * Commit on drag end rather than on the drop list's `dropped` event: the CDK
   * emits `ended` first, so anything cleared here would already be gone by the
   * time `dropped` ran. A null target means the pointer was never over a valid
   * gap, so the row simply goes back.
   */
  protected onDragEnded(event: CdkDragEnd): void {
    const dragged = this.dragging();
    const target = this.dropTarget();
    this.dragging.set(null);
    this.clearTarget();
    if (!dragged || !target) return;

    // The move handler is throttled through the CDK's animation frame, so a
    // pointer that leaves the list and releases in the same breath can arrive
    // here with a target computed from the last position inside it. The release
    // point is the authority on whether this was a drop at all.
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

  /** Whether a point is over the list, with the same slack the drag uses. */
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

  /** Replay the newest undo entry, restoring those categories as they were. */
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

  /**
   * Commit an order and adopt the tree the server returns. On failure nothing
   * was written — the list is reloaded to be sure of what is on screen.
   */
  private async persist(
    order: CategoryOrderEntry[],
    previous: CategoryOrderEntry[] | null,
  ): Promise<void> {
    this.busy.set(true);
    this.reorderError.set(false);
    try {
      this.categories.set(await this.admin.reorderCategories({ order }));
      if (previous) this.undoStack.update((stack) => [...stack, previous]);
    } catch {
      this.reorderError.set(true);
      this.categories.reload();
    } finally {
      this.busy.set(false);
    }
  }

  constructor() {
    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
    usePageSeo({ name: () => this.text.title });
  }
}
