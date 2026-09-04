import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { AuthService } from '../auth/auth.service';
import { landingFor } from '../auth/auth.guard';
import { currentUrl } from '../core/current-url';
import { navActionClasses, NavVariant } from './nav-action';
import { Icon } from '../ui/icons/icon';
import { fillText } from '@b2b-catalog-platform/shared';
import { WorkService } from '../work/work.service';

/**
 * The account control in the main navbar — one control for every role, and a
 * plain link in every state: to the login page while signed out, to that role's
 * one destination once signed in. Logging out lives on the destination page
 * (SignedInAs), so this needs no menu, no open state, and no JavaScript.
 *
 * **Both the glyph and the label carry the state**: the enclosed
 * `circle-user-round` once signed in, the plain `user` while signed out. The
 * label is what actually names the destination, in both navbars. The identity
 * itself is shown on the page the link leads to.
 *
 * **The unresolved state is answered rather than guessed.** The server is
 * session-blind by design (see AuthService) — it renders one document for
 * everybody, so an SSR pass cannot know who is asking. What the browser does
 * know, before `/auth/me` answers, is the readable session hint beside the
 * httpOnly cookie: it decides the label on the first frame, via the pre-paint
 * script for the paint itself (`session-shell.server.ts`) and `hintedRole` for
 * everything Angular renders after it.
 *
 * The cross-fade stays, for the one case the hint cannot cover: a session
 * ended somewhere else, where `/auth/me` contradicts a hint that is still in
 * the jar. Both labels are stacked in the same cell, so nothing moves and
 * nothing blinks, and the fade is held back a beat so the swap reads as the
 * page finishing rather than as the app signing someone out.
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
      <!-- Both glyphs in one cell, swapped the way the labels are: nothing
           moves, and the pre-paint stylesheet can pick one before Angular has
           rendered anything (see session-shell.server.ts). -->
      <span class="relative grid">
        <app-icon
          data-session="known"
          name="circle-user-round"
          class="col-start-1 row-start-1 h-6 w-6 transition-opacity delay-300 duration-200"
          [class.opacity-0]="signedOut()"
        />
        <app-icon
          data-session="anonymous"
          name="user"
          class="col-start-1 row-start-1 h-6 w-6 transition-opacity delay-300 duration-200"
          [class.opacity-0]="!signedOut()"
        />
        <!-- The marker (FR-WORK-01): a bare dot, never a figure. It is
             deliberately unlike the cart's badge, which counts lines in a
             filled chip — a number here would ask "five what?", and for an
             admin it would add up queues that have nothing to do with each
             other. The dot says only that something is waiting; the panel
             this link leads to says what. Amber is the app's "somebody has to
             act" signal, and the ring keeps it legible over the glyph. -->
        @if (waiting()) {
          <span
            aria-hidden="true"
            class="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-white"
          ></span>
        }
      </span>
      <!-- The dot is decoration; this is what a screen reader hears, and it
           carries the figure the dot deliberately does not show. -->
      @if (waiting()) {
        <span class="sr-only">{{ markerLabel() }}</span>
      }
      <span [class]="cls().labelRow">
        <span [class]="cls().label" [attr.data-label]="widestLabel">
          <!-- One grid cell holding both labels: the column is as wide as the
               longer of the two, so the fade never resizes the control, and
               the hidden one is taken out of the accessible name rather than
               merely made transparent. -->
          <span class="grid text-center">
            <span
              data-session="known"
              class="col-start-1 row-start-1 transition-opacity delay-300 duration-200"
              [class.opacity-0]="signedOut()"
              [attr.aria-hidden]="signedOut() ? 'true' : null"
              >{{ text.accountNav }}</span
            >
            <span
              data-session="anonymous"
              class="col-start-1 row-start-1 transition-opacity delay-300 duration-200"
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
  /** Which of the two navbars is drawing this control. */
  readonly variant = input<NavVariant>('bar');
  protected readonly cls = computed(() => navActionClasses(this.variant()));

  private readonly auth = inject(AuthService);
  private readonly work = inject(WorkService);
  private readonly url = currentUrl();

  /** Only ever true in the browser: the counts are session state and the
   * server renders one document for everybody (see WorkService). */
  protected readonly waiting = this.work.waiting;

  protected readonly text = inject(APP_TEXT).auth;

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

  /** The hint carries the role, so even an unresolved control points at the
   * right destination rather than at the login page. */
  protected readonly target = computed(() => {
    const role = this.auth.user()?.role ?? this.auth.hintedRole();
    return role && !this.signedOut() ? landingFor(role) : '/login';
  });

  /** What the marker says out loud — the figure it does not draw. */
  protected readonly markerLabel = computed(() =>
    fillText(this.text.workMarker, { count: this.work.total() }),
  );

  /**
   * Computed from the URL rather than left to `routerLinkActive`, which sets
   * `aria-current` only after the first render — so the label was drawn at its
   * resting weight and went medium a frame later, most visibly on a reload of
   * the login page. `currentUrl` has the answer before anything is drawn.
   */
  protected readonly active = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    const target = this.target();
    return path === target || path.startsWith(`${target}/`);
  });
}
