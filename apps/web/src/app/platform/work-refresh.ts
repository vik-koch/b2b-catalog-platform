/**
 * Asks the work marker to count again, for an action that clears work without
 * a navigation. The areas that do so may not import work, so the app root
 * provides the work service under this token.
 */
export abstract class WorkRefresh {
  abstract refresh(): Promise<void>;
}
