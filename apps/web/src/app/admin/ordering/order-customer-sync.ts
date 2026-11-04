import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { AdminOrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import {
  ConfirmService,
  confirmRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { arrowRightIcon } from '@b2b-catalog-platform/ui/icons/glyphs/arrow-right';
import { sendIcon } from '@b2b-catalog-platform/ui/icons/glyphs/send';

const NOTIFY = 'notify';

/** A run of the deployment's words, or a version it names. */
interface BehindPart {
  text: string;
  version: number | null;
}

/**
 * What the customer can see of an order and what they have been told: two
 * questions, always shown, as either can be left undone. Confirms the one
 * thing left to do and hands the page the call to make.
 */
@Component({
  selector: 'app-order-customer-sync',
  imports: [RouterLink, Button, Icon],
  host: { class: 'flex flex-col gap-3' },
  template: `
    <div class="min-w-0">
      <!-- Each named version links to itself. One line: a newline would put a
           space before the semicolon. -->
      <!-- prettier-ignore -->
      <p>@for (part of behind(); track $index) {@if (part.version) {<a
        class="font-medium hover:text-accent"
        [routerLink]="['/admin/orders', order().reference, 'revisions', part.version]"
        [title]="revisionText.openRevision"
      >{{ part.text }}</a>} @else {{{ part.text }}}}</p>
      <p class="text-ink-subtle">{{ emailed() }}</p>
    </div>
    @if (action(); as action) {
      <div [class]="actionsClass()">
        <button
          uiButton
          size="sm"
          variant="secondary"
          type="button"
          class="w-full gap-2 sm:w-auto"
          [disabled]="busy()"
          (click)="tell(action.kind)"
        >
          <ui-icon [glyph]="action.icon" class="size-4" />
          {{ action.label }}
        </button>
      </div>
    }
  `,
})
export class OrderCustomerSync {
  private readonly confirm = inject(ConfirmService);
  private readonly detailText = inject(ADMIN_TEXT).orders.detail;
  protected readonly text = this.detailText.tellCustomer;
  protected readonly revisionText = this.detailText.revisions;

  readonly order = input.required<AdminOrderDetail>();
  /** Answered elsewhere (FR-ADM-10): the state stays, the button goes. */
  readonly locked = input(false);
  readonly busy = input(false);
  /** The page's button-row classes, so this row matches the moves'. */
  readonly actionsClass = input('');

  /** Confirmed: whether the customer is to be mailed. The page runs the call. */
  readonly notify = output<boolean>();

  /** The told and current versions as one sentence, cut at the placeholders so
   * each is a link; the punctuation stays the deployment's. */
  protected readonly behind = computed((): BehindPart[] => {
    const order = this.order();
    const numbers: Record<string, number> = {
      '{seen}': order.customerRevisionNumber,
      '{current}': order.revisionNumber,
    };
    // One sentence whether level or behind.
    const template =
      order.customerRevisionNumber < order.revisionNumber
        ? this.text.behind
        : this.text.on;
    return template
      .split(/(\{seen\}|\{current\})/)
      .filter((piece) => piece !== '')
      .map((piece) =>
        piece in numbers
          ? {
              text: fillText(this.revisionText.versionInline, {
                number: numbers[piece],
              }),
              version: numbers[piece],
            }
          : { text: piece, version: null },
      );
  });

  /** Whether anything was ever said, and about what. */
  protected readonly emailed = computed(() => {
    const order = this.order();
    return order.notifiedRevisionNumber
      ? fillText(this.text.emailedOn, {
          notified: fillText(this.revisionText.versionInline, {
            number: order.notifiedRevisionNumber,
          }),
        })
      : this.text.emailedNever;
  });

  /** What is left, in order: their page first, as a mail must not link to an
   * unseen version; then the mail, re-sendable for a spam folder. */
  protected readonly action = computed(() => {
    const order = this.order();
    // Erased: the mail would reach the placeholder.
    if (this.locked() || order.personalDataRemovedAt) return null;
    if (order.customerRevisionNumber < order.revisionNumber) {
      return {
        kind: 'update' as const,
        label: this.text.update,
        icon: arrowRightIcon,
      };
    }
    return {
      kind: 'email' as const,
      label:
        order.notifiedRevisionNumber < order.customerRevisionNumber
          ? this.text.email
          : this.text.emailAgain,
      icon: sendIcon,
    };
  });

  /** Moves their page on, or writes about the version they hold: one decision,
   * one endpoint. */
  protected async tell(kind: 'update' | 'email'): Promise<void> {
    const asked =
      kind === 'update'
        ? {
            ...confirmRequest(this.text.updateConfirm),
            checks: [
              {
                key: NOTIFY,
                label: this.text.updateNotify,
                hint: this.detailText.notifyHint,
                // Ticked: an unseen version is news; the button stays for
                // later.
                checked: true,
              },
            ],
          }
        : { ...confirmRequest(this.text.emailConfirm), checks: [] };

    const answer = await this.confirm.askDetailed({
      ...asked,
      confirmVariant: 'primary',
    });
    if (!answer) return;
    this.notify.emit(kind === 'email' || (answer.checks[NOTIFY] ?? false));
  }
}
