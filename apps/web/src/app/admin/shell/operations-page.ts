import {
  Component,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  SETTING_CHANGES_PAGE_SIZE,
  SettingChange,
} from '@b2b-catalog-platform/shared/admin/platform';
import {
  fillText,
  OWNERSHIP_AREAS,
  OwnershipArea,
} from '@b2b-catalog-platform/shared/platform';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Hint } from '@b2b-catalog-platform/ui/fields/hint';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';

import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { delayedLoading } from '../../platform/delayed-loading';
import { usePageSeo } from '../../platform/page-seo';
import { ADMIN_EXCHANGE_TEXT } from '../exchange/exchange-text';
import { OwnershipSwitchService } from '../exchange/ownership-switch.service';
import { adminMomentFormat } from '../platform/dates/admin-date';
import { OwnershipService } from '../platform/ownership/ownership.service';
import { SettingChangesService } from '../platform/setting-changes.service';
import { MaintenanceSwitchService } from '../site/maintenance-switch.service';
import { ADMIN_SITE_TEXT } from '../site/site-text';
import { SwitchCard } from './switch-card';

/**
 * The two runtime switches and their one trail, read together when something
 * looks wrong. Ownership is confirmed both ways, as each turns something off;
 * maintenance is not: it is reached in a hurry and undone by the same click.
 */
@Component({
  selector: 'app-operations-page',
  imports: [
    PageHeader,
    RouterLink,
    Button,
    DisclosureToggle,
    Skeleton,
    StatusBadge,
    SwitchCard,
    ErrorText,
    Hint,
    DisclosureFrame,
  ],
  template: `
    <ui-page-header [title]="text.page.title" [intro]="text.page.intro">
      <a uiButton variant="secondary" routerLink="/admin">
        {{ text.backToPanel }}
      </a>
    </ui-page-header>

    <div class="max-w-3xl">
      <!-- Both reads arrive together and the page waits for them, with no
           skeleton: two fast reads, and a blank moment is the smaller lie. -->
      @if (settings.value(); as state) {
        <!-- First: reached for in a hurry, and what the public sees. -->
        <section class="mb-8">
          <h2 class="mb-3 text-base font-medium">
            {{ text.maintenanceHeading }}
          </h2>

          <app-switch-card
            [checked]="state.maintenanceEnabled"
            [label]="
              state.maintenanceEnabled
                ? maintenanceText.disableAria
                : maintenanceText.enableAria
            "
            [disabled]="pending()"
            (toggled)="flipMaintenance($event)"
          >
            <p switchCardTitle class="text-sm font-medium">
              {{
                state.maintenanceEnabled
                  ? maintenanceText.statusOn
                  : maintenanceText.statusOff
              }}
            </p>
            <p class="mt-3 text-sm text-ink-subtle">
              {{ maintenanceText.description }}
            </p>

            @if (maintenanceFailed()) {
              <p uiErrorText class="mt-3">
                {{ maintenanceText.error }}
              </p>
            }
          </app-switch-card>
        </section>

        <section class="mb-8">
          <h2 class="mb-1 text-base font-medium">
            {{ text.ownershipHeading }}
          </h2>
          <p class="mb-3 text-sm text-ink-subtle">{{ ownershipText.intro }}</p>

          <!-- The master is a read over the areas, never a fourth stored flag
               that could disagree with them. -->
          <app-switch-card
            class="mb-4"
            [checked]="allOwned()"
            [label]="allOwned() ? allText.take : allText.hand"
            [disabled]="pending()"
            (toggled)="flipEverything($event)"
          >
            <h3 switchCardTitle class="text-sm font-medium">
              {{ allText.heading }}
            </h3>

            <p uiHint class="mt-1">{{ allText.description }}</p>

            <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span uiStatusBadge [tone]="allTone()">{{ allStatus() }}</span>
              @if (mixed()) {
                <p class="text-sm text-ink-subtle">{{ mixedEffect() }}</p>
              }
            </div>
          </app-switch-card>

          <!-- Shut while the areas agree, as the badge above says it all; open
               when they disagree. -->
          <section
            class="mb-4 rounded-md border"
            uiDisclosureFrame
            [open]="areasOpen()"
          >
            <ui-disclosure-toggle
              [label]="allText.areasToggle"
              [open]="areasOpen()"
              [panelId]="areasPanelId"
              (toggled)="areasOpen.set(!areasOpen())"
            />

            @if (areasOpen()) {
              <div [id]="areasPanelId" class="border-t border-edge p-4">
                @for (area of areas; track area) {
                  <app-switch-card
                    class="mb-4 last:mb-0"
                    [checked]="isOwned(area)"
                    [label]="
                      isOwned(area) ? ownershipText.take : ownershipText.hand
                    "
                    [disabled]="pending()"
                    (toggled)="flipOwnership(area, $event)"
                  >
                    <h3 switchCardTitle class="text-sm font-medium">
                      {{ areaText(area).name }}
                    </h3>

                    <p uiHint class="mt-1">
                      {{ areaText(area).description }}
                    </p>

                    <!-- The state, then what follows from it. -->
                    <div
                      class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1"
                    >
                      <span
                        uiStatusBadge
                        [tone]="isOwned(area) ? 'info' : 'neutral'"
                      >
                        {{
                          isOwned(area)
                            ? ownershipText.statusOwned
                            : ownershipText.statusOwn
                        }}
                      </span>
                      <p class="text-sm text-ink-subtle">
                        {{
                          isOwned(area)
                            ? areaText(area).ownedEffect
                            : areaText(area).ownEffect
                        }}
                      </p>
                    </div>
                  </app-switch-card>
                }
              </div>
            }
          </section>

          @if (ownershipFailed()) {
            <p uiErrorText>{{ ownershipText.error }}</p>
          }
        </section>
        <!-- Fetched on opening: the trail answers "since when". -->
        <section
          class="rounded-md border"
          uiDisclosureFrame
          [open]="historyOpen()"
        >
          <ui-disclosure-toggle
            [label]="text.historyTitle"
            [open]="historyOpen()"
            [panelId]="historyPanelId"
            (toggled)="toggleHistory()"
          />

          @if (historyOpen()) {
            <div [id]="historyPanelId" class="border-t border-edge">
              @if (entries(); as rows) {
                @if (rows.length) {
                  <ul>
                    @for (entry of rows; track entry.id) {
                      <li
                        class="flex flex-wrap items-baseline justify-between
                               gap-x-4 gap-y-1 border-b border-edge px-4
                               py-2.5
                               last:border-b-0"
                      >
                        <span class="text-sm">{{ entry.what }}</span>
                        <span class="text-xs text-ink-subtle">{{
                          entry.who
                        }}</span>
                      </li>
                    }
                  </ul>
                  <!-- Only a full list can be missing anything; no paging, as
                       this is a recency question. -->
                  @if (recordCount() >= pageSize) {
                    <p class="px-4 py-2.5 text-xs text-ink-subtle">
                      {{ moreLabel }}
                    </p>
                  }
                } @else {
                  <p class="px-4 py-3 text-sm text-ink-subtle">
                    {{ text.historyEmpty }}
                  </p>
                }
              } @else if (showTrailSkeleton()) {
                <!-- An empty box would read as "nothing changed yet". -->
                <ui-skeleton class="m-4" [lines]="3" />
              }
            </div>
          }
        </section>
      } @else if (settings.error()) {
        <p uiErrorText>{{ text.loadError }}</p>
      }
    </div>
  `,
})
export class OperationsPage {
  protected readonly text = inject(ADMIN_TEXT).operations;
  protected readonly ownershipText = inject(ADMIN_EXCHANGE_TEXT).ownership;
  protected readonly maintenanceText = inject(ADMIN_SITE_TEXT).maintenance;
  protected readonly adminText = inject(ADMIN_TEXT);
  private readonly ownership = inject(OwnershipService);
  private readonly ownershipSwitch = inject(OwnershipSwitchService);
  private readonly maintenance = inject(MaintenanceSwitchService);
  private readonly settingChanges = inject(SettingChangesService);
  private readonly confirm = inject(ConfirmService);
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly moment = adminMomentFormat(this.locale);
  /** "Catalog and Customer accounts", in the deployment's locale. */
  private readonly areaJoin = new Intl.ListFormat(this.locale, {
    style: 'long',
    type: 'conjunction',
  });

  protected readonly allText = inject(ADMIN_EXCHANGE_TEXT).ownership.all;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly areas = OWNERSHIP_AREAS;
  protected readonly pageSize = SETTING_CHANGES_PAGE_SIZE;
  protected readonly historyPanelId = 'operations-history';
  protected readonly areasPanelId = 'operations-areas';

  protected readonly pending = signal(false);
  protected readonly ownershipFailed = signal(false);
  protected readonly maintenanceFailed = signal(false);
  protected readonly historyOpen = signal(false);

  /** Both switches, read together so the page paints once. */
  protected readonly settings = resource({
    loader: async () => {
      const [maintenance, ownership] = await Promise.all([
        this.maintenance.read(),
        this.ownership.read(),
      ]);
      return {
        maintenanceEnabled: maintenance.enabled,
        ownedAreas: ownership.ownedAreas,
      };
    },
  });

  /** Fetched on the first open, and again after a flip while it is open. */
  protected readonly changes = resource({
    params: () => (this.historyOpen() ? this.historyVersion() : undefined),
    loader: () => this.settingChanges.list(),
  });

  protected readonly showTrailSkeleton = delayedLoading(this.changes.isLoading);

  /** Bumped to re-ask for the trail after a switch moves. */
  private readonly historyVersion = signal(0);

  private readonly owned = computed(
    () => new Set(this.settings.value()?.ownedAreas ?? []),
  );

  protected readonly allOwned = computed(
    () => this.owned().size === this.areas.length,
  );
  protected readonly mixed = computed(
    () => this.owned().size > 0 && !this.allOwned(),
  );
  protected readonly allTone = computed(() =>
    this.owned().size ? ('info' as const) : ('neutral' as const),
  );
  protected readonly allStatus = computed(() =>
    this.allOwned()
      ? this.ownershipText.statusOwned
      : this.mixed()
        ? this.allText.statusMixed
        : this.ownershipText.statusOwn,
  );
  /** Open on arrival where the areas disagree, seeded from the first answer,
   * not the empty state before it; the operator's own choice stands after. */
  protected readonly areasOpen = linkedSignal<boolean, boolean>({
    source: () => this.settings.value() !== undefined,
    computation: (loaded, previous) =>
      previous?.source ? previous.value : loaded && this.mixed(),
  });

  /** "1 of 2 areas are managed by an external system." */
  protected readonly mixedEffect = computed(() =>
    fillText(this.allText.statusMixedEffect, {
      count: this.owned().size,
      total: this.areas.length,
    }),
  );

  /** "Only the 20 most recent changes are shown." */
  protected readonly moreLabel = fillText(this.text.historyMore, {
    count: SETTING_CHANGES_PAGE_SIZE,
  });

  constructor() {
    usePageSeo({ name: () => this.text.page.title, noindex: true });
  }

  protected toggleHistory(): void {
    this.historyOpen.set(!this.historyOpen());
  }

  protected isOwned(area: OwnershipArea): boolean {
    return this.owned().has(area);
  }

  protected areaText(area: OwnershipArea) {
    return this.ownershipText.areaText[area];
  }

  protected async flipMaintenance(enabled: boolean): Promise<void> {
    this.pending.set(true);
    this.maintenanceFailed.set(false);
    try {
      // The answer replaces that half of the state; no second read.
      const { enabled: now } = await this.maintenance.set(enabled);
      this.settings.update(
        (state) => state && { ...state, maintenanceEnabled: now },
      );
      this.historyVersion.update((n) => n + 1);
    } catch {
      this.maintenanceFailed.set(true);
    } finally {
      this.pending.set(false);
    }
  }

  /** Handing over locks fields; taking back refuses the external system. */
  protected async flipOwnership(
    area: OwnershipArea,
    owned: boolean,
  ): Promise<void> {
    const text = this.areaText(area);
    const labels = {
      hand: this.ownershipText.hand,
      take: this.ownershipText.take,
    };
    if (await this.confirmFlip({ ...text, ...labels }, owned)) {
      await this.write([area], owned);
    }
  }

  /** Every area in one request, one transaction and one decision; the API
   * records nothing for an area already where it is sent. */
  protected async flipEverything(owned: boolean): Promise<void> {
    if (await this.confirmFlip(this.allText, owned)) {
      await this.write(this.areas, owned);
    }
  }

  private confirmFlip(
    text: {
      handTitle: string;
      takeTitle: string;
      handConfirm: string;
      takeConfirm: string;
      handWarning: string;
      takeWarning: string;
      hand: string;
      take: string;
    },
    owned: boolean,
  ): Promise<boolean> {
    return this.confirm.ask({
      heading: owned ? text.handTitle : text.takeTitle,
      message: owned ? text.handConfirm : text.takeConfirm,
      warning: owned ? text.handWarning : text.takeWarning,
      confirmLabel: owned ? text.hand : text.take,
      cancelLabel: this.actionText.cancel,
      confirmVariant: 'danger',
    });
  }

  private async write(
    areas: readonly OwnershipArea[],
    owned: boolean,
  ): Promise<void> {
    this.pending.set(true);
    this.ownershipFailed.set(false);
    try {
      const { ownedAreas } = await this.ownershipSwitch.set(areas, owned);
      this.settings.update((state) => state && { ...state, ownedAreas });
      this.historyVersion.update((n) => n + 1);
    } catch {
      this.ownershipFailed.set(true);
    } finally {
      this.pending.set(false);
    }
  }

  /** The trail as decisions: a master flip writes a record per area, all with
   * the transaction's one timestamp, which is what groups them safely. */
  protected readonly entries = computed(() => {
    const rows = this.changes.value();
    if (!rows) return null;

    const groups: { id: string; rows: SettingChange[] }[] = [];
    for (const row of rows) {
      const last = groups.at(-1);
      const head = last?.rows[0];
      const sameDecision =
        head &&
        head.kind === 'ownership' &&
        row.kind === 'ownership' &&
        head.changedAt === row.changedAt &&
        head.enabled === row.enabled &&
        head.actorEmail === row.actorEmail;
      if (sameDecision) last.rows.push(row);
      else groups.push({ id: row.id, rows: [row] });
    }

    return groups.map((group) => ({
      id: group.id,
      what: this.describe(group.rows),
      who: this.who(group.rows[0]),
    }));
  });

  /** Records, not groups: what "only the 20 most recent" counts. */
  protected readonly recordCount = computed(
    () => this.changes.value()?.length ?? 0,
  );

  private describe(group: readonly SettingChange[]): string {
    const change = group[0];
    if (change.kind === 'maintenance') {
      return change.enabled
        ? this.text.historyMaintenanceOn
        : this.text.historyMaintenanceOff;
    }
    const areas = this.areaJoin.format(
      group.map(
        (row) =>
          this.ownershipText.areaText[row.area as OwnershipArea]?.name ??
          row.area ??
          '',
      ),
    );
    return fillText(
      change.enabled
        ? this.text.historyOwnershipOn
        : this.text.historyOwnershipOff,
      { area: areas },
    );
  }

  private who(change: SettingChange): string {
    return fillText(this.text.historyBy, {
      date: this.moment.format(new Date(change.changedAt)),
      actor: change.actorEmail ?? this.adminText.actorGone,
    });
  }
}
