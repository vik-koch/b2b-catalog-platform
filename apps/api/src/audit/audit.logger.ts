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
  // Product documents (FR-DOC-01). A replaced file is an update like any
  // other: which bytes a document now shows is in its content-hashed URL.
  | 'document.created'
  | 'document.updated'
  | 'document.deleted'
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
  | 'order.placed'
  // Order processing (FR-ORD-01/02/04). One event for every move, with the
  // status it landed on, rather than an event per transition: the question
  // asked later is who answered this order and when, and a name per state
  // would have to be extended every time the vocabulary grows.
  | 'order.status'
  // A new version of an order (FR-ORD-03), named by the version it wrote.
  | 'order.adjusted'
  // A manager deliberately bringing the customer's view of a finished order up
  // to date (FR-NOTIF-03). Audited because it is a mail somebody chose to
  // send, on an order the platform had stopped writing about on its own.
  | 'order.customer_notified'
  // The money arrived, or that observation was taken back — a mis-tick, not a
  // refund. Both are audited: the record of what a manager said is the point.
  | 'order.paid'
  | 'order.unpaid'
  // A document filed against an order, or taken back off it (FR-ORD-05). The
  // bytes are opaque to the platform, so who put them there is the only thing
  // it can say about them.
  | 'order.document.supplied'
  | 'order.document.removed'
  // The customer was told about one. Its own event because it can happen more
  // than once and later than the upload.
  | 'order.document.sent'
  // Machine credentials (NFR-SEC-09). Issuing one hands an automated client
  // the ability to rewrite the catalog, so both ends of its life are named.
  | 'apiToken.created'
  | 'apiToken.revoked';

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
    entity: {
      id?: string;
      slug?: string;
      name?: string;
      reference?: string;
      /** Where an order landed. Its own key rather than folded into `name`,
       * so a filter can ask for every order that was declined. */
      status?: string;
      /** Which version of an order was written (FR-ORD-03): a reference names
       * the order, and an adjustment is a thing that happened to one of its
       * versions. */
      revision?: number;
      /** What a machine token may do, comma-separated. Its own key so the log
       * can be asked for every credential ever issued against one
       * capability. */
      scope?: string;
    },
  ): void {
    const parts = [action, `actor=${actor?.email ?? 'guest'}`];
    if (entity.reference) parts.push(`reference=${entity.reference}`);
    if (entity.status) parts.push(`status=${entity.status}`);
    if (entity.scope) parts.push(`scope=${entity.scope}`);
    if (entity.revision) parts.push(`revision=${entity.revision}`);
    if (entity.id) parts.push(`id=${entity.id}`);
    if (entity.slug) parts.push(`slug=${entity.slug}`);
    // Quoted: names contain spaces, and an unquoted one would split the line's
    // key=value shape.
    if (entity.name) parts.push(`name=${JSON.stringify(entity.name)}`);
    this.logger.log(parts.join(' '));
  }
}
