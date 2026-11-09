import { getDeploymentConfigFile } from './app.deployment-config.server';
import { getSharedText, getStorefrontText } from './app.texts.server';
import {
  SHELL_STATE_ELEMENT_ID,
  ShellState,
} from './platform/config/shell-state';
import { getSuggestionsEnabled } from './platform/config/suggestions-enabled.server';

/** The same for every request: mounted files and the environment. */
let cachedScript: string | undefined;

/** `<` is escaped, so no string in a trusted file can close the tag early:
 * every page carries it. */
function getShellStateScript(): string {
  if (!cachedScript) {
    const state: ShellState = {
      deploymentConfig: getDeploymentConfigFile(),
      storefrontText: getStorefrontText(),
      sharedText: getSharedText(),
      suggestionsEnabled: getSuggestionsEnabled(),
    };
    const json = JSON.stringify(state).replace(/</g, '\\u003c');
    cachedScript = `<script id="${SHELL_STATE_ELEMENT_ID}" type="application/json">${json}</script>`;
  }
  return cachedScript;
}

/** Before `</head>`, so it is parsed before the bundle runs. */
export function injectShellState(html: string): string {
  return html.replace('</head>', `${getShellStateScript()}</head>`);
}
