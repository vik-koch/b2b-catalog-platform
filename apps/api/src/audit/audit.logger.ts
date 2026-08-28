import { Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '@b2b-catalog-platform/shared';

/** Actions worth attributing. A closed set, so the log stays greppable. */
export type AuditAction =
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'product.restored'
  // Publication (FR-ADM-06) — who let a price reach the storefront.
  | 'product.published'
  | 'product.unpublished'
  | 'category.created'
  | 'category.updated'
  | 'category.deleted'
  | 'category.reordered'
  | 'attribute.created'
  | 'attribute.updated'
  | 'attribute.reordered'
  | 'attribute.deleted'
  // Which filters one category offers (FR-ATTR-11).
  | 'category.filtersSaved'
  | 'category.filtersReset'
  // Renames rewrite product data across the whole catalog in one statement.
  | 'attribute.keyRenamed'
  | 'attribute.valueRenamed'
  | 'tier.created'
  | 'tier.updated'
  | 'tier.reordered'
  | 'tier.deleted'
  // Account management (FR-AUTH-03/04). Who let a customer in, who priced
  // them, and — the one an auditor actually asks about — who granted a role.
  | 'user.approved'
  | 'user.created'
  | 'user.updated'
  | 'user.invited'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.tierChanged'
  | 'user.roleChanged'
  | 'user.declined'
  // Self-service (FR-AUTH-06's neighbourhood). Named apart from `user.updated`
  // so the log distinguishes staff correcting a customer's details from the
  // customer correcting their own.
  | 'account.updated'
  | 'account.deleted'
  // The account's own address book. The id only — where a customer lives is
  // not something the log needs to repeat.
  | 'address.created'
  | 'address.updated'
  | 'address.deleted'
  // An order request, by its reference. The one audited event a guest can
  // cause, which is why the actor is optional below.
  | 'order.placed';

/**
 * Domain events for admin mutations — who changed what.
 *
 * Deliberately *not* request logging: Traefik already records method, path,
 * status and latency for every request that reaches it (ADR 0016), and
 * duplicating that in the app buys noise. What no access log can answer is
 * "who deleted this product, and which one was it" — the path carries a slug,
 * not a name, and the actor is inside a cookie. That is what this records.
 *
 * One line per event, `key=value` after a stable prefix, so Loki can filter on
 * the action without structured parsing:
 *
 *   [Audit] product.deleted actor=admin@example.com id=… slug=… name="…"
 *
 * The database keeps its own trail in parallel (`updatedBy`/`deletedBy`), which
 * outlives Loki's retention window; this is the searchable, time-ordered half.
 */
@Injectable()
export class AuditLogger {
  private readonly logger = new Logger('Audit');

  record(
    action: AuditAction,
    /** Null where the event has no account behind it — a guest's order. */
    actor: AuthUser | null,
    entity: { id?: string; slug?: string; name?: string; reference?: string },
  ): void {
    const parts = [action, `actor=${actor?.email ?? 'guest'}`];
    if (entity.reference) parts.push(`reference=${entity.reference}`);
    if (entity.id) parts.push(`id=${entity.id}`);
    if (entity.slug) parts.push(`slug=${entity.slug}`);
    // Quoted: names contain spaces, and an unquoted one would split the line's
    // key=value shape.
    if (entity.name) parts.push(`name=${JSON.stringify(entity.name)}`);
    this.logger.log(parts.join(' '));
  }
}
