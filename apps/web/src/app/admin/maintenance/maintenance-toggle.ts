import { Component, inject, signal } from '@angular/core';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Switch } from '../../ui/switch';
import { MaintenanceService } from './maintenance.service';

/**
 * Admin control for maintenance mode (FR-ADM-04). Reads the current toggle on
 * init and flips it on demand. Lives on the admin panel, which is client-only,
 * so it can rely on the browser to talk to the admin endpoints.
 */
@Component({
  selector: 'app-maintenance-toggle',
  imports: [Switch],
  template: `
    <!-- A panel card like any other: what it is on the left, and the control
         on the panel's right-hand axis — where every other card's remark
         stands. Its own heading is the row's name; the section above already
         says which topic this is. -->
    <div [class]="cardClass">
      <!-- The name and the switch on one line, the switch on the panel's own
           right-hand axis. Only those two: in a column half a panel wide the
           sentence saying which way the switch is set wrapped the switch onto
           a second line and took it off the axis, so it reads under the name
           instead — where it belongs anyway, being the answer rather than the
           control. -->

      <div class="flex items-center justify-between gap-4">
        @if (status(); as state) {
          <p class="text-sm font-medium">
            {{ state.on ? text.statusOn : text.statusOff }}
          </p>

          <app-switch
            [checked]="state.on"
            [label]="state.on ? text.disable : text.enable"
            [disabled]="pending()"
            (toggled)="setEnabled($event)"
          />
        } @else {
          <!-- The state arrives from the API, so hold its shape rather than
               letting the control pop in after the rest of the panel. -->
          <div
            class="h-4 w-56 animate-pulse rounded bg-stone-200"
            aria-hidden="true"
          ></div>
          <div
            class="h-6 w-11 animate-pulse rounded-full bg-stone-200"
            aria-hidden="true"
          ></div>
        }
      </div>

      <p class="mt-6 text-sm text-muted">{{ text.description }}</p>

      @if (failed()) {
        <p class="mt-3 text-sm text-red-600">{{ text.error }}</p>
      }
    </div>
  `,
})
export class MaintenanceToggle {
  /**
   * As tall as a four-row card, which is what stands beside it in the panel's
   * other column: a card of n rows is n × 3rem between n-1 hairlines inside
   * its own two, so four of them come to 197px. Set as a floor rather than a
   * height — the sentence under the heading is deployment wording and a long
   * one has to fit — and the block is centred in whatever it gets, so short
   * copy does not leave the switch hanging at the top of an empty box.
   *
   * It cannot be made to *snap* to the next row: CSS has no way to round a
   * box up to a multiple of its own content's height. Copy long enough to
   * overflow this would take the card off the panel's rhythm.
   */
  protected readonly cardClass =
    'flex min-h-[calc(3*3rem+5px)] flex-col justify-start rounded-lg border border-border px-5 py-3';

  protected readonly text = inject(ADMIN_TEXT).maintenance;
  private readonly maintenance = inject(MaintenanceService);

  // Wrapped rather than a bare boolean|undefined so `@if (…; as state)` can
  // bind it — an "off" boolean is falsy and would read as "not loaded yet".
  protected readonly status = signal<{ on: boolean } | null>(null);
  protected readonly pending = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.status.set({ on: (await this.maintenance.getStatus()).enabled });
    } catch {
      this.failed.set(true);
    }
  }

  protected async setEnabled(next: boolean): Promise<void> {
    this.pending.set(true);
    this.failed.set(false);
    try {
      const status = await this.maintenance.setEnabled(next);
      this.status.set({ on: status.enabled });
    } catch {
      this.failed.set(true);
    } finally {
      this.pending.set(false);
    }
  }
}
