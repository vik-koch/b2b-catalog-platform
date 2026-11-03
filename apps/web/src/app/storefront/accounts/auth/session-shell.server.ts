import { SESSION_HINT_COOKIE } from '@b2b-catalog-platform/shared/platform';

/**
 * An inline script that marks `<html>` signed in or not before the first
 * paint, from the readable hint cookie (the session cookie is httpOnly), so
 * the account control is right in the first picture (`.session-*` in
 * styles.css). A starting position only: AuthService removes the class once
 * `/auth/me` answers, so a stale hint cannot freeze the wrong label.
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

/** Before `</head>`, on rendered pages and the client shell alike. */
export function injectSessionShell(html: string): string {
  cachedScript ??= `<script>${sessionShellSource()}</script>`;
  return html.replace('</head>', `${cachedScript}</head>`);
}
