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

  toggle(): void {
    const next = !this.wanted();
    this.wanted.set(next);
    if (this.isBrowser) localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  }

  private readStored(): boolean {
    return this.isBrowser && localStorage.getItem(STORAGE_KEY) === '1';
  }
}
