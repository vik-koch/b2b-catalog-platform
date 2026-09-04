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
import { WorkCounts } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { workContract } from '../core/contract-routes.generated';
import { createOrpcClient } from '../core/orpc-client';

/**
 * What awaits the signed-in account (FR-WORK-01…04), asked of the API rather
 * than remembered: every figure is a count over work that is still there, so
 * there is nothing to acknowledge and nothing to keep in step (ADR 0046).
 *
 * **Never on the server.** The counts are session state, and the SSR pass is
 * session-blind by design (see AuthService) — a rendered figure would be the
 * guest's answer painted at a customer. The marker simply appears once the
 * browser has asked.
 *
 * **Re-asked per navigation**, which is what makes it self-correcting: a
 * manager who approves the last pending registration and goes back to the
 * panel finds the count gone, and a colleague's approval reaches the other
 * manager on their next click. Only a change of *path* counts — the admin
 * grids rewrite their query string on every keystroke of a search box, and a
 * count that has nothing to do with the filter would be re-fetched with each.
 */
@Injectable({ providedIn: 'root' })
export class WorkService {
  private readonly client = createOrpcClient(workContract);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly state = signal<WorkCounts>({});
  /** Per queue: absent where the account may not act on it, `0` where there is
   * nothing to do. The two are different answers and neither is drawn. */
  readonly counts = this.state.asReadonly();

  /** Everything waiting, across the queues this account is shown. What the
   * marker is: one dot for "there is something", never a sum on screen. */
  readonly total = computed(() =>
    Object.values(this.state()).reduce((sum, count) => sum + count, 0),
  );

  /** Whether anything at all awaits this account. */
  readonly waiting = computed(() => this.total() > 0);

  /** The path the current figures were fetched for. */
  private lastPath: string | null = null;
  /** Which fetch is the newest, so a slow answer cannot overwrite a fresh one. */
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

  /**
   * Ask again. Called on navigation, and by hand where an action resolves work
   * without leaving the screen it was resolved on — approving a registration,
   * publishing a product.
   */
  async refresh(): Promise<void> {
    if (!this.isBrowser) return;
    const generation = ++this.generation;
    this.lastPath = this.router.url.split(/[?#]/)[0];

    await this.auth.whenResolved();
    // Signed out: nothing waits on nobody, and the endpoint would 401.
    if (!this.auth.user()) {
      if (generation === this.generation) this.state.set({});
      return;
    }

    const { error, data } = await safe(this.client.getCounts());
    if (generation !== this.generation) return;
    // A failed count is no count: the marker stays dark rather than the
    // account control growing an error nobody can act on.
    this.state.set(error ? {} : data);
  }
}
