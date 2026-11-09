import {
  SyncRun,
  SyncRunStatus,
  SyncSummary,
} from '@b2b-catalog-platform/shared/core/exchange';
import { StatusTone } from '@b2b-catalog-platform/ui/content/status-badge';

import type { AdminExchangeText } from './exchange-text.type';

/** Amber where somebody has to act, green for what went through, red for
 * what broke, grey for a run that is simply over. */
export const SYNC_RUN_TONE: Record<SyncRunStatus, StatusTone> = {
  previewed: 'waiting',
  applied: 'ok',
  failed: 'danger',
  'no-change': 'neutral',
  superseded: 'neutral',
  discarded: 'neutral',
};

/** Who or what ran it: a machine run's only identity is its token's name,
 * the one an operator revokes. */
export function syncRunActor(
  run: SyncRun,
  text: AdminExchangeText['sync'],
): string {
  return run.tokenName ?? run.actorEmail ?? text.sourceUpload;
}

/** What a run came to in one line, only the figures that moved. */
export function syncChangeSummary(
  summary: SyncSummary | null,
  { mailed = false } = {},
): string {
  if (!summary) return '';
  return [
    summary.create > 0 ? `+${summary.create}` : '',
    summary.update > 0 ? `~${summary.update}` : '',
    summary.softDelete > 0 ? `−${summary.softDelete}` : '',
    mailed && summary.mailed > 0 ? `✉${summary.mailed}` : '',
    summary.errors > 0 ? `!${summary.errors}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
