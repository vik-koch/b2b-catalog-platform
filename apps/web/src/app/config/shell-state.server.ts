import { SHELL_STATE_ELEMENT_ID, ShellState } from './shell-state';
import { getAppText } from './app-text.server';
import { getDeploymentConfig } from './deployment-config.server';
import { getSuggestionsEnabled } from './suggestions-enabled.server';

/**
 * Serialized once per process: the sources are immutable mounted files and the
 * process environment, so the payload is identical for every request and every
 * visitor.
 */
let cachedScript: string | undefined;

/**
 * The `<script>` tag carrying the per-deployment state (see shell-state.ts).
 *
 * `<` is escaped so no string in the config or text catalog can close the tag
 * early and inject markup — the values come from a trusted mounted file, but
 * the tag is emitted into every page and must not depend on that trust.
 */
function getShellStateScript(): string {
  if (!cachedScript) {
    const state: ShellState = {
      deploymentConfig: getDeploymentConfig(),
      appText: getAppText(),
      suggestionsEnabled: getSuggestionsEnabled(),
    };
    const json = JSON.stringify(state).replace(/</g, '\\u003c');
    cachedScript = `<script id="${SHELL_STATE_ELEMENT_ID}" type="application/json">${json}</script>`;
  }
  return cachedScript;
}

/**
 * Injects the state into a document the Angular engine produced, immediately
 * before `</head>` so it is parsed before the app bundle runs. Applied to both
 * server-rendered pages and the client-rendered shell — the shell is a build
 * artifact and cannot carry per-deployment values any other way.
 */
export function injectShellState(html: string): string {
  return html.replace('</head>', `${getShellStateScript()}</head>`);
}
