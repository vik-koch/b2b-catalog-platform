import { AppText } from './app-text.type';
import { DeploymentConfig } from './deployment-config.type';

/**
 * Per-deployment values the browser needs before it can render any chrome.
 *
 * They cannot be baked into the bundle and there is no config endpoint, so the
 * Node process injects them into every HTML document it serves —
 * server-rendered pages and the client-rendered shell alike.
 * That is deliberately *not* TransferState.
 */
export interface ShellState {
  deploymentConfig: DeploymentConfig;
  appText: AppText;
}

/** The `<script type="application/json">` the server writes into `<head>`. */
export const SHELL_STATE_ELEMENT_ID = 'app-shell-state';

// Parsed once: two providers read from it, and the document never changes it.
let parsed: ShellState | undefined;

/**
 * Reads one slice of the injected state. No baked fallback — the server always
 * writes the script, so a missing element is a bug, surfaced loudly rather than
 * rendered as empty chrome.
 */
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
