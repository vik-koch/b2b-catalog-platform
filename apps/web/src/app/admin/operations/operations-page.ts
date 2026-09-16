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
  fillText,
  OWNERSHIP_AREAS,
  OwnershipArea,
  SETTING_CHANGES_PAGE_SIZE,
  SettingChange,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { ConfirmService } from '../../ui/confirm.service';
import {
  DISCLOSURE_FRAME,
  disclosureBorder,
  DisclosureToggle,
} from '../../ui/disclosure-toggle';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge } from '../../ui/status-badge';
import { Switch } from '../../ui/switch';
import { adminMomentFormat } from '../grid/admin-date';
import { SettingsService } from '../settings/settings.service';

/**
 * The two runtime switches, and the trail of changes to both.
 *
 * One page rather than two, because the trail is one trail: maintenance mode
 * and external ownership are the only settings an operator flips at runtime,
 * they are read in the same breath when something looks wrong, and a history
 * split across two screens is one nobody reads. It also takes maintenance mode
 * off the admin panel, where it was a card with bespoke height machinery
 * holding a single switch.
 *
 * Ownership is confirmed in both directions — each way turns something off,
 * and neither is obvious from the switch alone. Maintenance mode is not, as it
 * was not on the panel: it is the switch reached in a hurry, it is reversed by
 * the same click, and what it did is on every page behind it.
 */
@Component({
  selector: 'app-operations-page',
  imports: [
    RouterLink,
    Button,
    DisclosureToggle,
    Skeleton,
    StatusBadge,
    Switch,
  ],
  template: `
    <!-- Wrapping, unlike the token list's heading row: this title is several
         words longer, and at 375 the pair squeezed into two ragged columns
         instead of letting the button take a line of its own. -->
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <h1 class="text-3xl font-medium tracking-tight">{{ text.title }}</h1>
      <a appButton variant="secondary" routerLink="/admin">
        {{ text.backToPanel }}
      </a>
    </div>

    <div class="max-w-3xl">
      <!-- Everything here is one row in the database and arrives in one answer,
           so the whole page waits for it — including the trail's lid, which is
           a lid onto the very switches above it. No placeholder: this is a
           short screen behind one fast read, and a skeleton that stands in for
           two cards and a lid is a bigger lie than a blank moment. -->
      @if (settings.value(); as state) {
        <!-- Maintenance first: it is the one an operator reaches for in a
             hurry, and the one that changes what the public sees. -->
        <section class="mb-8">
          <h2 class="mb-3 text-base font-medium">
            {{ text.maintenanceHeading }}
          </h2>

          <div class="rounded-lg border border-border px-5 py-4">
            <div class="flex items-center justify-between gap-4">
              <p class="text-sm font-medium">
                {{
                  state.maintenanceEnabled
                    ? maintenanceText.statusOn
                    : maintenanceText.statusOff
                }}
              </p>
              <app-switch
                [checked]="state.maintenanceEnabled"
                [label]="
                  state.maintenanceEnabled
                    ? maintenanceText.disable
                    : maintenanceText.enable
                "
                [disabled]="pending()"
                (toggled)="flipMaintenance($event)"
              />
            </div>
            <p class="mt-3 text-sm text-muted">
              {{ maintenanceText.description }}
            </p>

            @if (maintenanceFailed()) {
              <p class="mt-3 text-sm text-red-600">
                {{ maintenanceText.error }}
              </p>
            }
          </div>
        </section>

        <section class="mb-8">
          <h2 class="mb-1 text-base font-medium">
            {{ text.ownershipHeading }}
          </h2>
          <p class="mb-3 text-sm text-muted">{{ ownershipText.intro }}</p>

          <!-- One shop above, areas beneath it. The master is a read over the
               areas and an action across them, never a fourth stored flag: a
               stored answer to "is everything owned" could disagree with the
               three switches under it, and then neither would be believable. -->
          <div class="mb-4 rounded-lg border border-border px-5 py-4">
            <div class="flex items-center justify-between gap-4">
              <h3 class="text-sm font-medium">{{ allText.heading }}</h3>
              <app-switch
                [checked]="allOwned()"
                [label]="allOwned() ? allText.take : allText.hand"
                [disabled]="pending()"
                (toggled)="flipEverything($event)"
              />
            </div>

            <p class="mt-1 text-sm text-muted">{{ allText.description }}</p>

            <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span appStatusBadge [tone]="allTone()">{{ allStatus() }}</span>
              @if (mixed()) {
                <p class="text-sm text-muted">{{ mixedEffect() }}</p>
              }
            </div>
          </div>

          <!-- Collapsed while the areas agree, because then the badge above has
               already said everything the rows would: three cards repeating one
               sentence is how a screen teaches an operator to stop reading it.
               Open when they disagree, where "partly" is not an answer. -->
          <section
            class="mb-4 rounded-md border"
            [class]="frame + ' ' + border(areasOpen())"
          >
            <app-disclosure-toggle
              [label]="allText.areasToggle"
              [open]="areasOpen()"
              [panelId]="areasPanelId"
              (toggled)="areasOpen.set(!areasOpen())"
            />

            @if (areasOpen()) {
              <div [id]="areasPanelId" class="border-t border-border p-4">
                @for (area of areas; track area) {
                  <div
                    class="mb-4 rounded-lg border border-border px-5 py-4 last:mb-0"
                  >
                    <div class="flex items-center justify-between gap-4">
                      <h3 class="text-sm font-medium">
                        {{ areaText(area).name }}
                      </h3>
                      <app-switch
                        [checked]="isOwned(area)"
                        [label]="
                          isOwned(area)
                            ? ownershipText.take
                            : ownershipText.hand
                        "
                        [disabled]="pending()"
                        (toggled)="flipOwnership(area, $event)"
                      />
                    </div>

                    <p class="mt-1 text-sm text-muted">
                      {{ areaText(area).description }}
                    </p>

                    <!-- What is true now, then what follows from it. Two
                         sentences rather than one: the state is the answer, the
                         effect is what an admin came here to change. -->
                    <div
                      class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1"
                    >
                      <span
                        appStatusBadge
                        [tone]="isOwned(area) ? 'info' : 'neutral'"
                      >
                        {{
                          isOwned(area)
                            ? ownershipText.statusOwned
                            : ownershipText.statusOwn
                        }}
                      </span>
                      <p class="text-sm text-muted">
                        {{
                          isOwned(area)
                            ? areaText(area).ownedEffect
                            : areaText(area).ownEffect
                        }}
                      </p>
                    </div>
                  </div>
                }
              </div>
            }
          </section>

          @if (ownershipFailed()) {
            <p class="text-sm text-red-600">{{ ownershipText.error }}</p>
          }
        </section>
        <!-- Behind a lid, and not fetched until it is opened: the switches
             above are why an operator came, and the trail is what they consult
             when the answer to "since when" matters. -->
        <section
          class="rounded-md border"
          [class]="frame + ' ' + border(historyOpen())"
        >
          <app-disclosure-toggle
            [label]="text.historyTitle"
            [open]="historyOpen()"
            [panelId]="historyPanelId"
            (toggled)="toggleHistory()"
          />

          @if (historyOpen()) {
            <div [id]="historyPanelId" class="border-t border-border">
              @if (entries(); as rows) {
                @if (rows.length) {
                  <ul>
                    @for (entry of rows; track entry.id) {
                      <li
                        class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0"
                      >
                        <span class="text-sm">{{ entry.what }}</span>
                        <span class="text-xs text-subtle">{{ entry.who }}</span>
                      </li>
                    }
                  </ul>
                  <!-- Said only when the list came back full, because only then
                       is anything missing from it. There is no paging: this is a
                       recency question, and a settings trail that needed pages
                       would be a shop with a much stranger problem. -->
                  @if (recordCount() >= pageSize) {
                    <p class="px-4 py-2.5 text-xs text-subtle">
                      {{ moreLabel }}
                    </p>
                  }
                } @else {
                  <p class="px-4 py-3 text-sm text-muted">
                    {{ text.historyEmpty }}
                  </p>
                }
              } @else if (showTrailSkeleton()) {
                <!-- The one placeholder left, and only once the fetch has
                     lasted a noticeable moment: an opened lid onto an empty
                     box reads as "nothing has been changed yet", which is a
                     sentence this panel can actually say. -->
                <app-skeleton class="m-4" [lines]="3" />
              }
            </div>
          }
        </section>
      } @else if (settings.error()) {
        <p class="text-sm text-red-600">{{ text.loadError }}</p>
      }
    </div>
  `,
})
export class OperationsPage {
  protected readonly text = inject(ADMIN_TEXT).operations;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  protected readonly maintenanceText = inject(ADMIN_TEXT).maintenance;
  protected readonly common = inject(ADMIN_TEXT).common;
  private readonly settingsService = inject(SettingsService);
  private readonly confirm = inject(ConfirmService);
  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;
  private readonly moment = adminMomentFormat(this.locale);
  /** "Catalog and Customer accounts", in the deployment's own locale. */
  private readonly areaJoin = new Intl.ListFormat(this.locale, {
    style: 'long',
    type: 'conjunction',
  });

  protected readonly allText = inject(ADMIN_TEXT).ownership.all;
  protected readonly areas = OWNERSHIP_AREAS;
  protected readonly pageSize = SETTING_CHANGES_PAGE_SIZE;
  protected readonly frame = DISCLOSURE_FRAME;
  protected readonly border = disclosureBorder;
  protected readonly historyPanelId = 'operations-history';
  protected readonly areasPanelId = 'operations-areas';

  protected readonly pending = signal(false);
  protected readonly ownershipFailed = signal(false);
  protected readonly maintenanceFailed = signal(false);
  protected readonly historyOpen = signal(false);

  /** Both switches in one answer; every write hands the same shape back. */
  protected readonly settings = resource({
    loader: () => this.settingsService.read(),
  });

  /** Fetched on the first open, and again after a flip while it is open. */
  protected readonly changes = resource({
    params: () => (this.historyOpen() ? this.historyVersion() : undefined),
    loader: () => this.settingsService.listChanges(),
  });

  protected readonly showTrailSkeleton = delayedLoading(this.changes.isLoading);

  /** Bumped to re-ask for the trail after a switch moves. */
  private readonly historyVersion = signal(0);

  private readonly owned = computed(
    () => new Set(this.settings.value()?.ownedAreas ?? []),
  );

  /** The master's state, derived — see the template's note on the fourth flag. */
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
      ? this.allText.statusOwned
      : this.mixed()
        ? this.allText.statusMixed
        : this.allText.statusOwn,
  );
  /**
   * The rows open on arrival only where the badge above cannot answer on its
   * own — a shop whose areas disagree.
   *
   * Seeded from the *first* answer the API gives rather than from `mixed()`
   * directly: before the read resolves nothing is owned, and a lid that took
   * that for an answer would decide to stay shut a moment before learning that
   * the areas disagree. Afterwards the operator's own open or close stands,
   * through every flip they make from here.
   */
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
    usePageSeo({ name: () => this.text.title, noindex: true });
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
      // The answer is the whole row, so it replaces the page's state outright
      // rather than prompting a second read of what was just returned.
      this.settings.set(await this.settingsService.setMaintenance(enabled));
      this.historyVersion.update((n) => n + 1);
    } catch {
      this.maintenanceFailed.set(true);
    } finally {
      this.pending.set(false);
    }
  }

  /**
   * Both directions are confirmed. Handing over turns the upload off and locks
   * fields; taking back starts refusing the external system. Neither is
   * something to discover afterwards.
   */
  protected async flipOwnership(
    area: OwnershipArea,
    owned: boolean,
  ): Promise<void> {
    const text = this.areaText(area);
    const confirmed = await this.confirm.ask({
      heading: owned ? text.handTitle : text.takeTitle,
      message: owned ? text.handConfirm : text.takeConfirm,
      warning: owned ? text.handWarning : text.takeWarning,
      confirmLabel: owned ? this.ownershipText.hand : this.ownershipText.take,
      cancelLabel: this.common.cancel,
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    await this.write([area], owned);
  }

  /**
   * The master switch: the same request with every area in it, so the shop
   * moves in one transaction and the trail shows one decision. Areas already
   * where they are being sent are sent anyway and record nothing — the switch
   * says "make this true of everything", and the API is what knows which of
   * them it was already true of.
   */
  protected async flipEverything(owned: boolean): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: owned ? this.allText.handTitle : this.allText.takeTitle,
      message: owned ? this.allText.handConfirm : this.allText.takeConfirm,
      warning: owned ? this.allText.handWarning : this.allText.takeWarning,
      confirmLabel: owned ? this.allText.hand : this.allText.take,
      cancelLabel: this.common.cancel,
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    await this.write(this.areas, owned);
  }

  private async write(
    areas: readonly OwnershipArea[],
    owned: boolean,
  ): Promise<void> {
    this.pending.set(true);
    this.ownershipFailed.set(false);
    try {
      this.settings.set(await this.settingsService.setOwnership(areas, owned));
      this.historyVersion.update((n) => n + 1);
    } catch {
      this.ownershipFailed.set(true);
    } finally {
      this.pending.set(false);
    }
  }

  /**
   * The trail, as decisions rather than as rows. One flip of the master switch
   * writes a record per area — the record has to name its area, or that area's
   * own history has a gap in it — but it was one decision, so the reader is
   * shown one line. Rows written by the same person, in the same direction, in
   * the same transaction share a timestamp exactly, which is what makes the
   * grouping safe: two flips a second apart do not collide.
   */
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

  /** How many records the page holds, which is what "only the 20 most recent"
   * counts — the grouping is a way of reading them, not fewer of them. */
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
    // Joined by the deployment's own locale rather than by a hard-coded comma:
    // "Catalog and Customer accounts" is one decision read aloud, and the list
    // is at most as long as there are areas.
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
      actor: change.actorEmail ?? this.text.historyActorGone,
    });
  }
}
