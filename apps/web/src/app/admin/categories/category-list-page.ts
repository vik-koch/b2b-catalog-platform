import {
  CdkDrag,
  CdkDragEnd,
  CdkDragHandle,
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
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { AdminCatalogService } from '../admin-catalog.service';
import { injectEditorReturnParams } from '../../shared/edit-mode/editor-return';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { UnpublishedCount } from '../products/unpublished-count';
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
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { gripVerticalIcon } from '@b2b-catalog-platform/ui/icons/glyphs/grip-vertical';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { rotateCcwIcon } from '@b2b-catalog-platform/ui/icons/glyphs/rotate-ccw';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';

/**
 * Pixels of indent per tree level, shared by the rows and the drop line. 1.5rem,
 * the same step the attribute inventory nests its values by — two lists that
 * step by different amounts read as two different kinds of nesting.
 */
const INDENT = 24;

/** How far past the list's top and bottom edge still counts as a drop. */
const EDGE_SLACK = 24;

/**
 * Admin category management: the category tree with add/delete, and reordering
 * and reparenting by drag-drop. Editing a category (name, parent, slug, mark) is
 * its own screen — the pencil links to
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
    CdkDragHandle,
    Skeleton,
    UnpublishedCount,
    ErrorText,
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

    <!-- Narrower than the heading above it: everything below is a column of
         fields and rows to read down, not a table to scan across, and a line
         that runs the full width of a desktop is a line nobody follows. -->
    <div class="max-w-3xl">
      <!-- The way back from a move sits where every admin grid puts its way
           back to the unfiltered list: a glyph at the right of the line under
           the heading, under the button that adds one. Always drawn and inert
           until there is something to undo, so nothing moves at the moment a
           drop lands and the admin is looking at the row that just moved. -->
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
                  <!-- No custom preview template: the CDK clones this row, which
                     is one row at its real size and type, never its subtree —
                     children are their own rows and stay where they are. -->
                  <div
                    class="border-edge py-3"
                    [class]="depthTint(node.depth)"
                    [class.border-t]="!first"
                    [style.marginLeft.px]="node.depth * indent"
                  >
                    <ui-record-row [compact]="true">
                      <span
                        recordControl
                        cdkDragHandle
                        uiIconButton
                        size="lead"
                        class="cursor-grab active:cursor-grabbing"
                        [attr.aria-label]="adminText.actions.reorder"
                        [title]="adminText.actions.reorder"
                      >
                        <ui-icon [glyph]="gripVerticalIcon" />
                      </span>
                      <!-- The whole line, and it wraps: a category's name is
                           written for the shelf it heads, not for this list,
                           and truncating it here would hide the very words the
                           tree is scanned for.

                           The name is the way to the shelf it heads, the way
                           every other admin list makes its title the link to
                           the thing itself. -->
                      <!-- Greyed like a deleted product where the storefront
                           leaves it out, because nothing beneath it is live
                           (FR-ADM-19); the words in its meta say so too. -->
                      <a
                        class="wrap-break-word font-medium text-ink
                               hover:text-accent"
                        [class.opacity-50]="!node.category.liveProductCount"
                        [routerLink]="['/catalog', node.category.slug]"
                        [title]="text.seeProducts"
                      >
                        {{ node.category.name }}
                      </a>
                      <!-- How many products stand under it, and the way into
                           the grid narrowed to them: a count that says
                           something, where the glyph beside it only said
                           "products". Dead text at zero — there would be
                           nothing for the grid to show. -->
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
                        <!-- The ones filed in a parent rather than in one of
                             its children, which the count above hides among
                             everything beneath it. Only where there are both:
                             in a leaf it would repeat the count. -->
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
  protected readonly gripVerticalIcon = gripVerticalIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly rotateCcwIcon = rotateCcwIcon;
  protected readonly trash2Icon = trash2Icon;
  private readonly admin = inject(AdminCatalogService);
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
   * Whether a row is nested, as a shade. The indent alone says it, but only
   * against the row above — a subcategory read on its own is just a row
   * starting a little to the right, and on a phone, where the whole list is
   * 340px wide, two levels of indent are 72px of that. One tint for every
   * nested level, the indent telling them apart: a darker one takes the
   * accent and amber text in the row below 4.5:1.
   */
  protected depthTint(depth: number): string {
    return depth > 0 ? 'bg-surface pl-2' : '';
  }

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
  /** Something to undo, and a moment free to undo it in. */
  protected readonly canUndo = computed(
    () => this.undoStack().length > 0 && !this.busy(),
  );

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
    usePageSeo({ name: () => this.text.page.title });
  }
}
