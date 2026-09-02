import {
  computed,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../auth/auth.service';
import { ADMIN_TEXT_LOADED, loadAdminText } from '../config/admin-text';

const STORAGE_KEY = 'admin-edit-mode';

/**
 * Storefront edit mode: an admin-only toggle that reveals inline
 * edit/add/delete affordances on the catalog. State is browser-local (a single
 * admin, one device) and only ever active for an admin — a non-admin session can
 * never enable it, and the server enforces every write regardless.
 */
@Injectable({ providedIn: 'root' })
export class EditModeService {
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly textLoaded = inject(ADMIN_TEXT_LOADED);

  readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');

  private readonly wanted = signal(this.readStored());

  constructor() {
    // Warm the admin wording as soon as we know the session is an admin, so the
    // toggle and its affordances are ready before anyone reaches for them.
    effect(() => {
      if (this.isBrowser && this.isAdmin()) {
        // A failure leaves edit mode disabled, which is the safe state; the
        // admin routes surface the same problem through their guard.
        loadAdminText().catch((error) => console.error(error));
      }
    });
  }

  /**
   * True only when an admin has turned it on. Also waits on the admin text,
   * which arrives by fetch: every inline affordance reads that wording, so
   * gating here keeps them from rendering with blank labels and lets them use
   * ADMIN_TEXT synchronously.
   */
  readonly enabled = computed(
    () => this.isAdmin() && this.wanted() && this.textLoaded(),
  );

  /**
   * Whether `enabled` is a final answer rather than "not yet". It is false for
   * the moment between bootstrap and `/auth/me`, and — for an admin who left
   * edit mode on — until the wording it waits for has arrived.
   *
   * A page that would otherwise tell the visitor something is wrong reads this
   * first: an admin arriving at a page they can still write must not be shown
   * the error on the way. Always true on the server, which has no session and
   * never renders edit affordances.
   */
  readonly settled = computed(
    () =>
      !this.isBrowser ||
      (this.auth.resolved() &&
        (!(this.isAdmin() && this.wanted()) || this.textLoaded())),
  );

  /**
   * How many edit-aware surfaces are on the page. The toggle is drawn only
   * where there is something for it to reveal — on the cart, an account page
   * or the admin panel it was an affordance that answered nothing. Counted
   * rather than declared per route: every editable surface already goes
   * through `editAwareContent`, whether edit mode is on or not, so the page
   * itself is the answer and no route table has to be kept in step with it.
   */
  private readonly editables = signal(0);
  readonly hasEditables = computed(() => this.editables() > 0);

  /** Registers one surface; the returned function releases it. */
  registerEditable(): () => void {
    this.editables.update((n) => n + 1);
    return () => this.editables.update((n) => n - 1);
  }

  toggle(): void {
    const next = !this.wanted();
    this.wanted.set(next);
    if (this.isBrowser) localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  }

  private readStored(): boolean {
    return this.isBrowser && localStorage.getItem(STORAGE_KEY) === '1';
  }
}
