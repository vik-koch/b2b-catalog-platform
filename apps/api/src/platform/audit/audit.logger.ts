import { Injectable, Logger } from '@nestjs/common';

import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/** Actions worth attributing. A closed set, so the log stays greppable. */
type AuditAction =
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'product.restored'
  // The only record left that the product existed (FR-ADM-21).
  | 'product.purged'
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
  | 'category.filtersSaved'
  | 'catalog.filtersSaved'
  | 'category.filtersReset'
  // A rename rewrites product data across the whole catalog.
  | 'attribute.keyRenamed'
  | 'attribute.valueRenamed'
  | 'document.created'
  | 'document.updated'
  | 'document.deleted'
  | 'tier.created'
  | 'tier.updated'
  | 'tier.reordered'
  | 'tier.deleted'
  | 'tier.default-set'
  | 'user.approved'
  | 'user.created'
  | 'user.updated'
  | 'user.invited'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.tierChanged'
  | 'user.sourceIdChanged'
  | 'user.roleChanged'
  | 'user.declined'
  | 'user.deleted'
  | 'user.signInStepExempted'
  | 'user.signInStepRequired'
  // The holder's own change, apart from staff's `user.updated`.
  | 'account.updated'
  | 'account.phone-confirmed'
  | 'account.deleted'
  // By id only: the log does not repeat where a customer lives.
  | 'address.created'
  | 'address.updated'
  | 'address.deleted'
  // The one event a guest can cause, hence the optional actor.
  | 'order.placed'
  // Every move, with the status it landed on.
  | 'order.status'
  | 'order.adjusted'
  | 'order.customer_notified'
  // `unpaid` takes back a mis-tick; it is not a refund.
  | 'order.paid'
  | 'order.unpaid'
  | 'order.document.supplied'
  | 'order.document.removed'
  | 'order.document.sent'
  // By reference only: the details are what went (NFR-LEGAL-14).
  | 'order.personalDataRemoved'
  | 'apiToken.created'
  | 'apiToken.revoked'
  | 'consent.withdrawn';

/** An automated client has no account (NFR-SEC-09): it is logged by its
 * token's name, the only thing known about it. */
export type AuditActor = AuthUser | { readonly token: string };

/** The `actor=` value, in a shape that stays one `key=value` token: a token's
 * name is an operator's label and may well contain spaces. */
function actorLabel(actor: AuditActor | null): string {
  if (!actor) return 'guest';
  return 'token' in actor
    ? `token:${JSON.stringify(actor.token)}`
    : actor.email;
}

/**
 * Who changed what, which no access log can say: the path holds a slug and the
 * actor is in a cookie. One `key=value` line per event, so Loki filters on the
 * action without parsing:
 *
 *   [Audit] product.deleted actor=admin@example.com id=… slug=… name="…"
 */
@Injectable()
export class AuditLogger {
  private readonly logger = new Logger('Audit');

  record(
    action: AuditAction,
    /** Null for a guest's order. */
    actor: AuditActor | null,
    entity: {
      id?: string;
      slug?: string;
      name?: string;
      reference?: string;
      /** Its own key, so a filter can ask for every declined order. */
      status?: string;
      /** The order version written (FR-ORD-03). */
      revision?: number;
      /** A machine token's scopes, comma-separated. */
      scope?: string;
      /** Why an admin did something the person asked for (FR-ADM-23). */
      reason?: string;
    },
  ): void {
    const parts = [action, `actor=${actorLabel(actor)}`];
    if (entity.reference) parts.push(`reference=${entity.reference}`);
    if (entity.status) parts.push(`status=${entity.status}`);
    if (entity.scope) parts.push(`scope=${entity.scope}`);
    if (entity.reason) parts.push(`reason=${entity.reason}`);
    if (entity.revision) parts.push(`revision=${entity.revision}`);
    if (entity.id) parts.push(`id=${entity.id}`);
    if (entity.slug) parts.push(`slug=${entity.slug}`);
    // Quoted, as a name with spaces would split the key=value line.
    if (entity.name) parts.push(`name=${JSON.stringify(entity.name)}`);
    this.logger.log(parts.join(' '));
  }
}
