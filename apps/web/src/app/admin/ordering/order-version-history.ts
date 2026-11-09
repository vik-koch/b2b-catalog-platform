import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AdminOrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { fillText, moneyFormat } from '@b2b-catalog-platform/shared/platform';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';

import { ACCOUNTS_CONFIG } from '../../core/accounts/accounts-config';
import { CATALOG_CONFIG } from '../../core/catalog/catalog-config';
import { orderDateTimeFormat } from '../../core/ordering/order-formats';
import {
  orderStatusLabel,
  orderStatusTone,
} from '../../core/ordering/order-status';
import { SHARED_ORDERING_TEXT } from '../../core/ordering/ordering-text';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { stableValue } from '../../platform/stable-value';
import { orderChanges } from './order-changes';
import { ADMIN_ORDERING_TEXT } from './ordering-text';
import { AdminOrdersService } from './orders.service';
import { revisionKindLabel } from './revision-labels';
import { staffBlockLabels } from './staff-block-labels';
import { OrderAdjustChanges, OrderChange } from './ui/order-adjust-changes';

/**
 * Every version of an order, newest first (FR-ORD-03), with its note and its
 * difference from the one before: the adjustment screen's comparison, so what
 * was approved is what it says. Fetched only once opened.
 */
@Component({
  selector: 'app-order-version-history',
  imports: [
    RouterLink,
    DisclosureToggle,
    DisclosureFrame,
    Skeleton,
    StatusBadge,
    OrderAdjustChanges,
  ],
  host: { class: 'block' },
  template: `
    <div class="rounded-md border" uiDisclosureFrame [open]="open()">
      <ui-disclosure-toggle
        [label]="text.subheading"
        [count]="order().revisionNumber"
        [countLabel]="count()"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      />
      @if (open()) {
        <!-- The rule belongs to the content: fetched on opening, an empty box
             drew a stray line. Bars meanwhile. -->
        <div [id]="panelId">
          @if (entries().length) {
            <!-- Ruled: spaced versions run into one block. -->
            <ol class="divide-y divide-edge border-t border-edge">
              @for (entry of entries(); track entry.number) {
                <li class="p-4">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <!-- Purpose and status first: the note below explains
                         them. -->
                    <a
                      class="font-medium hover:text-accent"
                      [routerLink]="[
                        '/admin/orders',
                        order().reference,
                        'revisions',
                        entry.number,
                      ]"
                      [title]="text.openRevision"
                    >
                      {{ entry.label }}
                    </a>
                    <!-- The order's own status colours. -->
                    <span uiStatusBadge [tone]="entry.tone">
                      {{ entry.status }}
                    </span>
                    <span class="text-ink-subtle">{{ entry.kindLabel }}</span>
                  </div>
                  <p class="mt-1 text-ink-subtle">{{ entry.writtenBy }}</p>

                  <!-- Quiet: solid pills beside the status read as three
                       states. -->
                  @if (entry.customerView || entry.notified) {
                    <p class="mt-1 flex flex-wrap items-center gap-2">
                      @if (entry.customerView) {
                        <span uiStatusBadge variant="dot" tone="info">
                          {{ text.customerView }}
                        </span>
                      }
                      @if (entry.notified; as notified) {
                        <span uiStatusBadge variant="dot" tone="ok">
                          {{ notified }}
                        </span>
                      }
                    </p>
                  }

                  @if (entry.note) {
                    <p class="mt-1">
                      <span class="text-ink-subtle">
                        {{ names.changeNote }}:
                      </span>
                      {{ entry.note }}
                    </p>
                  }

                  <!-- Folded, and compared only when opened: twenty versions
                       are twenty whole-order diffs. -->
                  @if (entry.kind === 'adjustment') {
                    <div class="mt-2">
                      <ui-disclosure-toggle
                        class="-mx-4 block"
                        [label]="text.changes"
                        [open]="diffOpen().has(entry.number)"
                        [panelId]="diffPanelId(entry.number)"
                        (toggled)="toggleDiff(entry.number)"
                      />
                      @if (diffOpen().has(entry.number)) {
                        <app-order-adjust-changes
                          [id]="diffPanelId(entry.number)"
                          [empty]="text.noChanges"
                          [changes]="diff(entry.number)"
                        />
                      }
                    </div>
                  }
                </li>
              }
            </ol>
          } @else if (versions.error()) {
            <p class="border-t border-edge p-4 text-ink-subtle" role="alert">
              {{ text.loadError }}
            </p>
          } @else {
            <div class="border-t border-edge p-4">
              <ui-skeleton [lines]="3" />
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class OrderVersionHistory {
  private readonly api = inject(AdminOrdersService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly accountsConfig = inject(ACCOUNTS_CONFIG);
  private readonly catalogConfig = inject(CATALOG_CONFIG);
  private readonly currency = moneyFormat(this.config);
  private readonly adminText = inject(ADMIN_TEXT);
  private readonly adminOrderingText = inject(ADMIN_ORDERING_TEXT);
  private readonly ordersText = this.adminOrderingText.orders;
  protected readonly text = this.ordersText.detail.revisions;
  private readonly sharedText = inject(SHARED_TEXT);
  protected readonly sharedOrderingText = inject(SHARED_ORDERING_TEXT);
  protected readonly names = this.sharedOrderingText.order;
  private readonly dateTimeFormat = orderDateTimeFormat(this.config.locale);
  private readonly blockLabels = staffBlockLabels(
    this.sharedOrderingText,
    this.ordersText,
    this.ordersText.detail,
  );

  readonly order = input.required<AdminOrderDetail>();

  protected readonly panelId = 'order-versions';
  protected readonly open = signal(false);
  protected readonly diffOpen = signal(new Set<number>());

  /** Keyed on the order itself: every reload after a move, a customer update
   * or a mail brings a new one, and the thread refetches with it. */
  protected readonly versions = resource({
    params: () => (this.open() ? this.order() : undefined),
    loader: ({ params }) => this.api.revisions(params.reference),
  });

  /** Held across the refetch, so the thread does not blink to bars. */
  private readonly held = stableValue(this.versions);
  private readonly loaded = computed(() => this.held() ?? []);

  protected readonly count = computed(() =>
    fillText(this.adminText.countSuffix, {
      count: this.order().revisionNumber,
    }),
  );

  protected readonly entries = computed(() =>
    this.loaded().map((version) => ({
      number: version.revisionNumber,
      note: version.note,
      kind: version.kind,
      kindLabel: revisionKindLabel(version.kind, this.text),
      status: orderStatusLabel(
        version.status,
        version.fulfilmentMethod,
        this.ordersText.statuses,
      ),
      tone: orderStatusTone(version.status, 'staff', version.fulfilmentMethod),
      customerView: version.customerView,
      // Null for most: the customer hears about news, not versions.
      notified: version.notifiedAt
        ? fillText(this.text.notified, {
            date: this.dateTimeFormat.format(new Date(version.notifiedAt)),
          })
        : null,
      label: fillText(this.text.versionLabel, {
        number: version.revisionNumber,
      }),
      writtenBy: fillText(this.text.writtenBy, {
        date: this.dateTimeFormat.format(new Date(version.revisionCreatedAt)),
        // A person, then the external system, then the unsigned: the
        // submission, or a deleted author.
        who:
          version.author ??
          version.source ??
          (version.revisionNumber === 1
            ? this.text.authorCustomer
            : this.text.authorUnknown),
      }),
    })),
  );

  protected diffPanelId(number: number): string {
    return `${this.panelId}-diff-${number}`;
  }

  protected toggleDiff(number: number): void {
    this.diffOpen.update((open) => {
      const next = new Set(open);
      if (!next.delete(number)) next.add(number);
      return next;
    });
  }

  /** Computed on request: a whole-order comparison per entry is too much for an
   * unopened list. */
  protected diff(number: number): OrderChange[] {
    const versions = this.loaded();
    const index = versions.findIndex(
      (version) => version.revisionNumber === number,
    );
    // Newest first, so the predecessor is next; the first began.
    const before = index >= 0 ? versions[index + 1] : undefined;
    if (!before) return [];
    return orderChanges(
      before,
      versions[index],
      { ...this.ordersText.changes, total: this.names.total },
      this.sharedText,
      this.blockLabels,
      {
        address: this.accountsConfig.address,
        phoneInput: this.config.phoneInput,
        locale: this.config.locale,
        currency: this.currency,
        boxUnits: this.catalogConfig.boxUnits,
      },
    );
  }
}
