import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { ADMIN_TEXT_LOADED, loadAdminText } from '../config/admin-text';

const STORAGE_KEY = 'admin-edit-mode';

/** Storefront edit mode: an admin's own switch, kept in this browser, for
 * inline affordances. The API checks every write regardless. */
@Injectable({ providedIn: 'root' })
export class EditModeService {
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly textLoaded = inject(ADMIN_TEXT_LOADED);

  readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');

  private readonly wanted = signal(this.readStored());

  constructor() {
    // Warmed for an admin, before anyone reaches for the toggle.
    effect(() => {
      if (this.isBrowser && this.isAdmin()) {
        // A failure leaves edit mode off, the safe state.
        loadAdminText().catch((error) => console.error(error));
      }
    });
  }

  /** Also waits on the admin text, so the affordances read ADMIN_TEXT
   * synchronously and never with blank labels. */
  readonly enabled = computed(
    () => this.isAdmin() && this.wanted() && this.textLoaded(),
  );

  /** Whether `enabled` is final: false until `/auth/me`, and for an admin who
   * left it on, until the text arrives. A page reads it before showing an error
   * an admin should not see. True on the server. */
  readonly settled = computed(
    () =>
      !this.isBrowser ||
      (this.auth.resolved() &&
        (!(this.isAdmin() && this.wanted()) || this.textLoaded())),
  );

  /** The edit-aware surfaces on the page, counted through `editAwareContent`,
   * so the toggle shows only where it reveals something. */
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
