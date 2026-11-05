import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts/accounts-text';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../platform/auth/auth.service';
import { landingFor } from '../../platform/auth/auth.guard';
import { currentPath, isUnder } from '../../platform/current-url';
import { navActionClasses, NavVariant } from '../platform/nav-action';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { WorkService } from '../../core/work/work.service';
import { circleUserRoundDotIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-user-round-dot';
import { circleUserRoundIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-user-round';
import { userIcon } from '@b2b-catalog-platform/ui/icons/glyphs/user';

/**
 * The account control, a plain link for every role: to sign in, or to the
 * role's landing page, where signing out lives. Before `/auth/me` answers, the
 * session hint decides it (the pre-paint script in `session-shell.server.ts`,
 * then `hintedRole`). Glyphs and labels are stacked and cross-faded a beat
 * late, for a session ended elsewhere that the hint still claims.
 */
@Component({
  selector: 'app-account-link',
  imports: [RouterLink, Icon],
  template: `
    <a
      [routerLink]="target()"
      [attr.aria-current]="active() ? 'page' : null"
      [class]="cls().action"
    >
      <!-- Both glyphs in one cell, so the pre-paint stylesheet can pick one. -->
      <span class="relative grid">
        <!-- Two glyphs, with and without the marker's gap, cross-faded on the
             marker; the wrapper fades on the session. -->
        <span
          data-session="known"
          class="col-start-1 row-start-1 grid transition-opacity delay-300
                 duration-200"
          [class.opacity-0]="signedOut()"
        >
          <ui-icon
            [glyph]="circleUserRoundIcon"
            class="col-start-1 row-start-1 size-6 transition-opacity
                   duration-200"
            [class.opacity-0]="waiting()"
          />
          <ui-icon
            [glyph]="circleUserRoundDotIcon"
            class="col-start-1 row-start-1 size-6 transition-opacity
                   duration-200"
            [class.opacity-0]="!waiting()"
          />
        </span>
        <ui-icon
          data-session="anonymous"
          [glyph]="userIcon"
          class="col-start-1 row-start-1 size-6 transition-opacity delay-300
                 duration-200"
          [class.opacity-0]="!signedOut()"
        />
        <!-- The marker (FR-WORK-01): a dot, never a figure, as an admin's
             queues do not add up. -->
        @if (waiting()) {
          <span
            aria-hidden="true"
            class="absolute -top-0.5 -right-0.5 size-2.5 animate-marker-pop
                   rounded-full bg-warning-dot"
          ></span>
        }
      </span>
      @if (waiting()) {
        <span class="sr-only">{{ markerLabel() }}</span>
      }
      <span [class]="cls().labelRow">
        <span [class]="cls().label" [attr.data-label]="widestLabel">
          <!-- One cell as wide as the longer label; the hidden one leaves the
               accessible name. -->
          <span class="grid text-center">
            <span
              data-session="known"
              class="col-start-1 row-start-1 transition-opacity delay-300
                     duration-200"
              [class.opacity-0]="signedOut()"
              [attr.aria-hidden]="signedOut() ? 'true' : null"
              >{{ text.accountNav }}</span
            >
            <span
              data-session="anonymous"
              class="col-start-1 row-start-1 transition-opacity delay-300
                     duration-200"
              [class.opacity-0]="!signedOut()"
              [attr.aria-hidden]="signedOut() ? null : 'true'"
              >{{ text.login }}</span
            >
          </span>
        </span>
      </span>
    </a>
  `,
})
export class AccountLink {
  protected readonly circleUserRoundDotIcon = circleUserRoundDotIcon;
  protected readonly circleUserRoundIcon = circleUserRoundIcon;
  protected readonly userIcon = userIcon;
  /** Which of the two navbars is drawing this control. */
  readonly variant = input<NavVariant>('bar');
  protected readonly cls = computed(() => navActionClasses(this.variant()));

  private readonly auth = inject(AuthService);
  private readonly work = inject(WorkService);
  private readonly path = currentPath();

  protected readonly waiting = this.work.waiting;

  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).auth;

  /** `text-stable` reserves the active weight's width from `data-label`, so it
   * has to be given the label that will need the most of it. */
  protected readonly widestLabel =
    this.text.login.length > this.text.accountNav.length
      ? this.text.login
      : this.text.accountNav;

  /** The answer once there is one, the browser's own hint until then. */
  protected readonly signedOut = computed(() =>
    this.auth.resolved()
      ? this.auth.user() === null
      : this.auth.hintedRole() === null,
  );

  /** The hint carries the role, so even an unresolved control points right. */
  protected readonly target = computed(() => {
    const role = this.auth.user()?.role ?? this.auth.hintedRole();
    return role && !this.signedOut() ? landingFor(role) : '/login';
  });

  /** The figure the marker does not draw. */
  protected readonly markerLabel = computed(() =>
    fillText(this.text.workMarkerAria, { count: this.work.total() }),
  );

  /** From the URL, as `routerLinkActive` sets `aria-current` a frame late. */
  protected readonly active = computed(() =>
    isUnder(this.path(), this.target()),
  );
}
