import { Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '@b2b-catalog-platform/shared';

/** Actions worth attributing. A closed set, so the log stays greppable. */
export type AuditAction =
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'product.restored'
  | 'category.created'
  | 'category.updated'
  | 'category.deleted'
  | 'category.reordered'
  | 'tier.created'
  | 'tier.updated'
  | 'tier.deleted';

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
    actor: AuthUser,
    entity: { id?: string; slug?: string; name?: string },
  ): void {
    const parts = [action, `actor=${actor.email}`];
    if (entity.id) parts.push(`id=${entity.id}`);
    if (entity.slug) parts.push(`slug=${entity.slug}`);
    // Quoted: names contain spaces, and an unquoted one would split the line's
    // key=value shape.
    if (entity.name) parts.push(`name=${JSON.stringify(entity.name)}`);
    this.logger.log(parts.join(' '));
  }
}
