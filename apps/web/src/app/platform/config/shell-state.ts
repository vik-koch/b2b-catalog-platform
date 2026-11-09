import {
  DeploymentConfig,
  type SharedText,
} from '@b2b-catalog-platform/shared/platform';

import { StorefrontText } from './storefront-text.type';

/** What the browser needs before it draws any chrome. Not in the bundle and
 * not TransferState: the Node process writes it into every document it serves,
 * the client-rendered shell included. */
export interface ShellState {
  deploymentConfig: DeploymentConfig;
  storefrontText: StorefrontText;
  sharedText: SharedText;
  /** From the environment, not a config file (see suggestions-enabled.ts). */
  suggestionsEnabled: boolean;
}

/** The `<script type="application/json">` the server writes into `<head>`. */
export const SHELL_STATE_ELEMENT_ID = 'app-shell-state';

let parsed: ShellState | undefined;

/** No fallback: a missing element is a bug, not empty chrome. */
export function readShellState<K extends keyof ShellState>(
  key: K,
): ShellState[K] {
  if (!parsed) {
    const element = document.getElementById(SHELL_STATE_ELEMENT_ID);
    if (!element?.textContent) {
      throw new Error(`Missing #${SHELL_STATE_ELEMENT_ID} in the document`);
    }
    parsed = JSON.parse(element.textContent) as ShellState;
  }
  return parsed[key];
}
