import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  AdminOrderDetail,
  AdminOrderDocument,
  fillText,
  orderDocumentPath,
  OrderDocumentKind,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { documentFileLabel, documentFileSize } from '../../core/document-file';
import { Button } from '../../ui/button';
import { IconButton } from '../../ui/icon-button';
import { ConfirmService } from '../../ui/confirm.service';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { AdminOrdersService } from './orders.service';

/** One line of the list: a document that exists, or a kind that could. */
interface DocumentRow {
  readonly kind: OrderDocumentKind;
  readonly label: string;
  /** What is behind it, said in one line. */
  readonly detail: string;
  readonly hint: string;
  /** Null where nothing has been supplied and nothing is generated — the
   * payment instructions of an invoiced order nobody has filed one for. */
  readonly href: string | null;
  readonly supplied: boolean;
  /** Set where a supplied file was filed against an older version. */
  readonly outdated: string | null;
  /** Whether the customer has already been written to about this file. */
  readonly sent: boolean;
  /** Why the customer cannot be written to about this one yet — their page has
   * not reached the version it belongs to — or null where they can. */
  readonly behind: string | null;
}

/**
 * An order's documents, on the screen where the order is answered
 * (FR-ORD-05, FR-CART-05, ADR 0052).
 *
 * One row per kind and never two: a supplied file replaces the generated
 * summary rather than sitting beside it, and a reader offered both would have
 * to guess which one the shop means.
 *
 * The payment row appears only where the order is **invoiced**. On a cash
 * order the document cannot exist — only the shop can say what it says, and
 * there is nothing to say — so the control is absent rather than disabled: a
 * button that can never be pressed states nothing.
 */
@Component({
  selector: 'app-order-documents-panel',
  imports: [Button, IconButton, AdminIcon],
  host: { class: 'block' },
  template: `
    <input
      #fileInput
      type="file"
      class="hidden"
      accept="application/pdf,image/*"
      (change)="onFile($event)"
    />

    <ul class="divide-y divide-border">
      @for (row of rows(); track row.kind) {
        <li class="py-2 first:pt-0">
          <!-- The name and what can be done to it on one centred line; the
               small print under it rather than beside it. The controls are a
               group so they wrap as one — squeezed into the same row they took
               the name down to a letter a line. -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <app-admin-icon
              name="file-text"
              class="h-4 w-4 shrink-0 text-subtle"
            />
            <!-- The name and what it is, together: when the controls wrap to
                 their own line the caption must not be left under them,
                 describing the buttons. -->
            <span class="min-w-[9rem] flex-1">
              <span class="block truncate">{{ row.label }}</span>
              <span class="block text-xs text-subtle">{{ row.detail }}</span>
            </span>

            <!-- Wrapping inside the group as well as around it: three
                 controls do not fit a phone on one line, and a group that
                 could only break as a whole pushed the last one off the
                 card. -->
            <div class="flex flex-wrap items-center gap-2">
              @if (row.href; as href) {
                <a
                  appIconButton
                  [href]="href"
                  target="_blank"
                  rel="noopener"
                  [attr.aria-label]="text.open"
                  [title]="text.open"
                >
                  <app-admin-icon name="external-link" />
                </a>
              }
              @if (!readOnly()) {
                <button
                  appButton
                  size="sm"
                  variant="secondary"
                  type="button"
                  class="gap-2"
                  [disabled]="busy() !== null"
                  (click)="choose(row.kind, fileInput)"
                >
                  <app-admin-icon name="upload" class="h-4 w-4" />
                  {{
                    busy() === row.kind
                      ? text.uploading
                      : row.supplied
                        ? text.replace
                        : text.upload
                  }}
                </button>
                @if (row.supplied) {
                  <!-- Telling the customer is its own act (ADR 0052): a file is
                     filed when it exists and sent when the order is ready to
                     be written about, and it can be sent again to somebody who
                     lost the message. Absent while their page is behind the
                     version it belongs to — the message would announce a
                     document they cannot open. -->
                  @if (!row.behind) {
                    <button
                      appButton
                      size="sm"
                      variant="secondary"
                      type="button"
                      class="gap-2"
                      [disabled]="busy() !== null"
                      (click)="notify(row.kind)"
                    >
                      <app-admin-icon name="send" class="h-4 w-4" />
                      {{ row.sent ? text.notifySent : text.notify }}
                    </button>
                  }
                  <button
                    appButton
                    size="sm"
                    variant="dangerOutline"
                    type="button"
                    [disabled]="busy() !== null"
                    (click)="remove(row.kind)"
                  >
                    {{ text.remove }}
                  </button>
                }
              }
            </div>
          </div>

          <!-- Indented to the name's own edge, so the block reads as one
               entry rather than as a list of sentences. -->
          <div class="ps-7">
            <!-- Nothing checks a supplied file against the order, so this is
                 the only warning there is that it quotes an older total. -->
            @if (row.outdated; as warning) {
              <p class="text-xs text-amber-700">{{ warning }}</p>
            }
            <!-- Why there is no send button on this row. Said rather than left
                 to be worked out from an absence. -->
            @if (row.behind; as waiting) {
              <p class="mt-1 text-xs text-subtle">{{ waiting }}</p>
            }
          </div>
        </li>
      }
    </ul>

    @if (failed()) {
      <p class="mt-2 text-sm text-red-600" role="alert">{{ text.error }}</p>
    }
  `,
})
export class OrderDocumentsPanel {
  private readonly api = inject(AdminOrdersService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).orderDetail.documents;
  // The two size words, which the document list already owns: a file's size
  // reads the same wherever it is written.
  private readonly sizes = inject(ADMIN_TEXT).documentList;

  readonly order = input.required<AdminOrderDetail>();
  /**
   * Reading rather than answering: the same rows, with nothing to press.
   *
   * Set on the screen that reads back one version of an order. Supplying a
   * file, sending it or taking it away are acts on the *order*, and offering
   * them from a superseded version would be answering the order from a page
   * that deliberately does not — the same rule that leaves every transition
   * control off that screen. What stays is what the row says, including the
   * staleness marker, which reads against the version being looked at.
   */
  readonly readOnly = input(false);
  /** Asks the page to re-read the order: what a document is, and whether it is
   * behind, is the order's answer and not this component's. */
  readonly changed = output<void>();

  protected readonly busy = signal<OrderDocumentKind | null>(null);
  protected readonly failed = signal(false);
  private chosen: OrderDocumentKind | null = null;

  protected readonly rows = computed<DocumentRow[]>(() => {
    const order = this.order();
    const of = (kind: OrderDocumentKind): AdminOrderDocument | undefined =>
      order.documents.find((document) => document.kind === kind);

    const rows: DocumentRow[] = [];
    // Invoiced orders only: a cash order has no payment instructions to give.
    if (order.paymentMethod !== 'cash') {
      rows.push(this.row('payment-instructions', of('payment-instructions')));
    }
    rows.push(this.row('order-summary', of('order-summary')));
    // A kind with nothing behind it is an invitation to supply one, so it is
    // drawn where a manager can — and dropped where they cannot, since a row
    // with no file, no controls and only its hint is a line about nothing.
    return this.readOnly() ? rows.filter((row) => row.href) : rows;
  });

  private row(
    kind: OrderDocumentKind,
    document: AdminOrderDocument | undefined,
  ): DocumentRow {
    const order = this.order();
    const label =
      kind === 'payment-instructions'
        ? this.text.paymentInstructions
        : this.text.summary;
    const hint =
      kind === 'payment-instructions'
        ? this.text.paymentHint
        : this.text.summaryHint;

    if (!document) {
      return {
        kind,
        label,
        detail: hint,
        hint,
        href: null,
        supplied: false,
        sent: false,
        outdated: null,
        behind: null,
      };
    }
    return {
      kind,
      label,
      detail:
        document.source === 'generated'
          ? this.text.generated
          : `${documentFileLabel(
              document.contentType as never,
            )} · ${documentFileSize(document.byteSize ?? 0, this.sizes)} · ${fillText(
              this.text.supplied,
              { date: this.day(document.suppliedAt) },
            )}`,
      hint,
      href: orderDocumentPath(kind, { reference: order.reference }),
      supplied: document.source === 'supplied',
      // Read off the row rather than remembered by this screen: whether the
      // shop has sent somebody their payment details has to survive a reload.
      sent: document.notifiedAt !== null,
      outdated: document.outdated
        ? fillText(this.text.outdated, {
            number: document.suppliedForRevision ?? 0,
            current: order.revisionNumber,
          })
        : null,
      behind:
        (document.suppliedForRevision ?? 0) > order.customerRevisionNumber
          ? this.text.notifyBehind
          : null,
    };
  }

  /** The picker is one input for both rows, so which row asked for it is
   * remembered here rather than duplicated into two hidden inputs. */
  protected choose(kind: OrderDocumentKind, input: HTMLInputElement): void {
    this.chosen = kind;
    this.failed.set(false);
    input.value = '';
    input.click();
  }

  protected async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    const kind = this.chosen;
    if (!file || !kind) return;

    this.busy.set(kind);
    try {
      await this.api.supplyDocument(this.order().reference, kind, file);
      this.changed.emit();
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(null);
    }
  }

  protected async notify(kind: OrderDocumentKind): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: this.text.notifyConfirmHeading,
      message: this.text.notifyConfirmMessage,
      confirmLabel: this.text.notifyConfirm,
      cancelLabel: this.text.keep,
    });
    if (!confirmed) return;

    this.busy.set(kind);
    this.failed.set(false);
    try {
      await this.api.notifyAboutDocument(this.order().reference, kind);
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(null);
    }
  }

  protected async remove(kind: OrderDocumentKind): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: this.text.removeConfirmHeading,
      message: this.text.removeConfirmMessage,
      confirmLabel: this.text.removeConfirm,
      cancelLabel: this.text.keep,
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    this.busy.set(kind);
    try {
      await this.api.removeDocument(this.order().reference, kind);
      this.changed.emit();
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(null);
    }
  }

  private day(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString() : '';
  }
}
