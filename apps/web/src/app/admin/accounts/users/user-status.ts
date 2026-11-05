import { fillText } from '@b2b-catalog-platform/shared/platform';
import { StatusTone } from '@b2b-catalog-platform/ui/content/status-badge';
import {
  StaffUser,
  UserStatus,
} from '@b2b-catalog-platform/shared/core/accounts';
import type { AdminAccountsText } from '../accounts-text.type';

type ListText = AdminAccountsText['users']['list'];

/**
 * The badge tone per account state, shared so the list, the detail page and
 * the editor cannot drift. Red for deactivated: a deliberate block somebody
 * has to notice, where a closed account is just history.
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

export function userStatusLabel(text: ListText, status: UserStatus): string {
  return {
    pending: text.statusPending,
    invited: text.statusInvited,
    active: text.statusActive,
    disabled: text.statusDisabled,
    anonymized: text.statusAnonymized,
  }[status];
}

export function userRoleLabel(text: ListText, role: StaffUser['role']): string {
  return {
    admin: text.roleAdmin,
    manager: text.roleManager,
    user: text.roleUser,
  }[role];
}

/**
 * What a null tier reads as: the default list by its own name, marked as the
 * default, since a null is no choice anybody made.
 */
export function baseTierName(
  template: string,
  tiers: readonly { isDefault: boolean; label: string }[] | undefined,
): string {
  return fillText(template, {
    list: tiers?.find((tier) => tier.isDefault)?.label ?? '',
  });
}
