import { UserStatus } from '@b2b-catalog-platform/shared';
import { StatusTone } from '../../ui/status-badge';

/**
 * The badge tone per account state, shared by the list and the editor — the two
 * screens show the same account, and the badge drifted between them.
 *
 * Red rather than grey for a deactivated account: it is a deliberate block
 * somebody has to notice, where a closed one is just history. An invited
 * account is neither waiting on staff nor settled — it is waiting on the person
 * invited, which is worth pointing out and is nobody's fault.
 */
export function userStatusTone(status: UserStatus): StatusTone {
  const tones: Record<UserStatus, StatusTone> = {
    pending: 'waiting',
    invited: 'info',
    active: 'ok',
    disabled: 'danger',
    anonymized: 'neutral',
  };
  return tones[status];
}
