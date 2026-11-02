import { SESSION_HINT_COOKIE } from '@b2b-catalog-platform/shared';

/**
 * The inline script that tells the first paint whether anyone is signed in.
 *
 * A client-rendered route's shell carries no account control at all, and
 * drawing it from Angular is always the *second* picture the visitor sees. A
 * server-rendered page already draws the right one — the render asks the API
 * as the visitor — and there the script simply agrees with it. The session
 * cookie is httpOnly and unreadable to it, but
 * its companion hint is not — so a synchronous script in `<head>` can put the
 * answer on `<html>` before anything is drawn, and the stylesheet draws the
 * right label from there (see `.session-*` in styles.css).
 *
 * The class is a starting position, not the truth: `AuthService` takes it off
 * as soon as `/auth/me` has answered, which is what stops a hint left over
 * from a session revoked elsewhere from freezing the wrong label on screen.
 */
export function sessionShellSource(): string {
  return `(function(){try{
var m=document.cookie.match(/(?:^|;\\s*)${SESSION_HINT_COOKIE}=([^;]*)/);
var r=m?decodeURIComponent(m[1]):'';
var known=r==='admin'||r==='manager'||r==='user';
document.documentElement.classList.add(known?'session-known':'session-anonymous');
}catch(e){}})();`;
}

let cachedScript: string | undefined;

/** Injects it immediately before `</head>`, into server-rendered pages and the
 * client-rendered shell alike: the shell needs it, and a rendered page whose
 * session was revoked since the hint was written is drawn signed out, which
 * the hint then overrides until `/auth/me` answers — same as the shell. */
export function injectSessionShell(html: string): string {
  cachedScript ??= `<script>${sessionShellSource()}</script>`;
  return html.replace('</head>', `${cachedScript}</head>`);
}
