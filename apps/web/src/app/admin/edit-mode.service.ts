import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../auth/auth.service';

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

  readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');

  private readonly wanted = signal(this.readStored());

  /** True only when an admin has turned it on (and we are in the browser). */
  readonly enabled = computed(() => this.isAdmin() && this.wanted());

  toggle(): void {
    const next = !this.wanted();
    this.wanted.set(next);
    if (this.isBrowser) localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  }

  private readStored(): boolean {
    return this.isBrowser && localStorage.getItem(STORAGE_KEY) === '1';
  }
}
