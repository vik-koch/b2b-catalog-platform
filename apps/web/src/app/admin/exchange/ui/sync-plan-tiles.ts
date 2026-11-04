import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface SyncPlanTile {
  label: string;
  value: number;
  danger: boolean;
}

/** A plan's counts, one figure per tile. */
@Component({
  selector: 'app-sync-plan-tiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <dl class="mb-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
      @for (tile of tiles(); track tile.label) {
        <div>
          <dt class="text-ink-subtle">{{ tile.label }}</dt>
          <dd class="text-lg font-medium" [class.text-danger]="tile.danger">
            {{ tile.value }}
          </dd>
        </div>
      }
    </dl>
  `,
})
export class SyncPlanTiles {
  readonly tiles = input.required<readonly SyncPlanTile[]>();
}
