import { Component, inject, signal } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { MaintenanceService } from './maintenance.service';

/**
 * Admin control for maintenance mode (FR-ADM-04). Reads the current toggle on
 * init and flips it on demand. Lives on the admin panel, which is client-only,
 * so it can rely on the browser to talk to the admin endpoints.
 */
@Component({
  selector: 'app-maintenance-toggle',
  imports: [Button],
  template: `
    <section class="rounded-lg border border-stone-200 p-5">
      <h2 class="text-lg font-semibold">{{ text.adminHeading }}</h2>
      <p class="mt-1 text-sm text-stone-600">{{ text.adminDescription }}</p>

      @if (enabled() !== undefined) {
        <p class="mt-4 text-sm font-medium">
          {{ enabled() ? text.statusOn : text.statusOff }}
        </p>
        <button
          appButton
          [variant]="enabled() ? 'secondary' : 'primary'"
          class="mt-3"
          [disabled]="pending()"
          (click)="toggle()"
        >
          {{ enabled() ? text.disable : text.enable }}
        </button>
      }

      @if (failed()) {
        <p class="mt-3 text-sm text-red-600">{{ text.error }}</p>
      }
    </section>
  `,
})
export class MaintenanceToggle {
  protected readonly text = inject(APP_TEXT).maintenance;
  private readonly maintenance = inject(MaintenanceService);

  protected readonly enabled = signal<boolean | undefined>(undefined);
  protected readonly pending = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.enabled.set((await this.maintenance.getStatus()).enabled);
    } catch {
      this.failed.set(true);
    }
  }

  protected async toggle(): Promise<void> {
    this.pending.set(true);
    this.failed.set(false);
    try {
      const status = await this.maintenance.setEnabled(!this.enabled());
      this.enabled.set(status.enabled);
    } catch {
      this.failed.set(true);
    } finally {
      this.pending.set(false);
    }
  }
}
