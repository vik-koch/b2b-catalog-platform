import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { safe } from '@orpc/client';
import { filter } from 'rxjs';
import { WorkCounts } from '@b2b-catalog-platform/shared/core/work';
import { AuthService } from '../../platform/auth/auth.service';
import { workContract } from './contract-routes.generated';
import { createOrpcClient } from '../../platform/orpc-client';
import { WorkRefresh } from '../../platform/work-refresh';

/**
 * What awaits the signed-in account (FR-WORK-01…04). Browser only: no render
 * waits a round trip for a dot. Re-asked when the path changes, not the query,
 * which the admin grids rewrite on every keystroke.
 */
@Injectable({ providedIn: 'root' })
export class WorkService implements WorkRefresh {
  private readonly client = createOrpcClient(workContract);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly state = signal<WorkCounts>({});
  readonly counts = this.state.asReadonly();

  /** For the marker's label: the marker itself is a dot, never a figure. */
  readonly total = computed(() =>
    Object.values(this.state()).reduce((sum, count) => sum + count, 0),
  );

  readonly waiting = computed(() => this.total() > 0);

  private lastPath: string | null = null;
  /** So a slow answer cannot overwrite a newer one. */
  private generation = 0;

  constructor() {
    if (!this.isBrowser) return;

    void this.refresh();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const path = event.urlAfterRedirects.split(/[?#]/)[0];
        if (path === this.lastPath) return;
        void this.refresh();
      });
  }

  async refresh(): Promise<void> {
    if (!this.isBrowser) return;
    const generation = ++this.generation;
    this.lastPath = this.router.url.split(/[?#]/)[0];

    await this.auth.whenResolved();
    // Signed out, the endpoint would 401.
    const counts = this.auth.user() ? await this.fetch() : {};
    if (generation === this.generation) this.state.set(counts);
  }

  /** A failed count leaves the marker dark: an error there helps nobody. */
  private async fetch(): Promise<WorkCounts> {
    const { error, data } = await safe(this.client.getCounts());
    return error ? {} : data;
  }
}
