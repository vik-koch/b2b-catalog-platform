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
    <section class="rounded-lg border border-border p-5">
      <h2 class="text-lg font-semibold">{{ text.heading }}</h2>
      <p class="mt-1 text-sm text-muted">{{ text.description }}</p>

      @if (status(); as state) {
        <div class="mt-4 flex items-center gap-3">
          <app-switch
            [checked]="state.on"
            [label]="state.on ? text.disable : text.enable"
            [disabled]="pending()"
            (toggled)="setEnabled($event)"
          />
          <p class="text-sm font-medium">
            {{ state.on ? text.statusOn : text.statusOff }}
          </p>
        </div>
      } @else {
        <!-- The state arrives from the API, so hold its shape rather than
             letting the control pop in after the rest of the panel. -->
        <div class="mt-4 flex items-center gap-3" aria-hidden="true">
          <div class="h-6 w-11 animate-pulse rounded-full bg-stone-200"></div>
          <div class="h-4 w-56 animate-pulse rounded bg-stone-200"></div>
        </div>
      }

      @if (failed()) {
        <p class="mt-3 text-sm text-red-600">{{ text.error }}</p>
      }
    </section>
  `,
})
export class MaintenanceToggle {
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
