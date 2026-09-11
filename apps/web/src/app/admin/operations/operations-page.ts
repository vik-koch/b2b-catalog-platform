import { Component, computed, inject, resource, signal } from '@angular/core';
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

          @for (area of areas; track area) {
            <div class="mb-4 rounded-lg border border-border px-5 py-4">
              <div class="flex items-center justify-between gap-4">
                <h3 class="text-sm font-medium">{{ areaName(area) }}</h3>
                <app-switch
                  [checked]="isOwned(area)"
                  [label]="
                    isOwned(area) ? ownershipText.take : ownershipText.hand
                  "
                  [disabled]="pending()"
                  (toggled)="flipOwnership(area, $event)"
                />
              </div>

              <p class="mt-1 text-sm text-muted">{{ areaDescription(area) }}</p>

              <!-- What is true now, then what follows from it. Two sentences
                   rather than one: the state is the answer, the effect is what
                   an admin came here to change. -->
              <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
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
                      ? ownershipText.statusOwnedEffect
                      : ownershipText.statusOwnEffect
                  }}
                </p>
              </div>
            </div>
          }

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
              @if (changes.value(); as rows) {
                @if (rows.length) {
                  <ul>
                    @for (change of rows; track change.id) {
                      <li
                        class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0"
                      >
                        <span class="text-sm">{{ describe(change) }}</span>
                        <span class="text-xs text-subtle">{{
                          who(change)
                        }}</span>
                      </li>
                    }
                  </ul>
                  <!-- Said only when the list came back full, because only then
                       is anything missing from it. There is no paging: this is a
                       recency question, and a settings trail that needed pages
                       would be a shop with a much stranger problem. -->
                  @if (rows.length >= pageSize) {
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
  private readonly moment = adminMomentFormat(
    inject(DEPLOYMENT_CONFIG).catalog.currency.locale,
  );

  protected readonly areas = OWNERSHIP_AREAS;
  protected readonly pageSize = SETTING_CHANGES_PAGE_SIZE;
  protected readonly frame = DISCLOSURE_FRAME;
  protected readonly border = disclosureBorder;
  protected readonly historyPanelId = 'operations-history';

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

  protected areaName(area: OwnershipArea): string {
    return this.ownershipText.areas[area];
  }

  protected areaDescription(area: OwnershipArea): string {
    return this.ownershipText.areaDescription[area];
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
    const confirmed = await this.confirm.ask({
      heading: owned
        ? this.ownershipText.handTitle
        : this.ownershipText.takeTitle,
      message: owned
        ? this.ownershipText.handConfirm
        : this.ownershipText.takeConfirm,
      warning: owned
        ? this.ownershipText.handWarning
        : this.ownershipText.takeWarning,
      confirmLabel: owned ? this.ownershipText.hand : this.ownershipText.take,
      cancelLabel: this.common.cancel,
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    this.pending.set(true);
    this.ownershipFailed.set(false);
    try {
      this.settings.set(await this.settingsService.setOwnership(area, owned));
      this.historyVersion.update((n) => n + 1);
    } catch {
      this.ownershipFailed.set(true);
    } finally {
      this.pending.set(false);
    }
  }

  protected describe(change: SettingChange): string {
    if (change.kind === 'maintenance') {
      return change.enabled
        ? this.text.historyMaintenanceOn
        : this.text.historyMaintenanceOff;
    }
    const area =
      this.ownershipText.areas[change.area as OwnershipArea] ?? change.area;
    return fillText(
      change.enabled
        ? this.text.historyOwnershipOn
        : this.text.historyOwnershipOff,
      { area: area ?? '' },
    );
  }

  protected who(change: SettingChange): string {
    return fillText(this.text.historyBy, {
      date: this.moment.format(new Date(change.changedAt)),
      actor: change.actorEmail ?? this.text.historyActorGone,
    });
  }
}
