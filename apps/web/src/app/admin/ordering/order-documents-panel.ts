import { ADMIN_ORDERING_TEXT } from './ordering-text';
import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  orderDocumentPath,
  OrderDocumentKind,
  AdminOrderDetail,
  AdminOrderDocument,
} from '@b2b-catalog-platform/shared/core/ordering';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import {
  AcceptedDocumentMime,
  fillText,
} from '@b2b-catalog-platform/shared/platform';
import { documentFileCaption } from '../../platform/document-file';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import {
  ConfirmService,
  confirmRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { adminDayFormat } from '../platform/dates/admin-date';
import { AdminOrdersService } from './orders.service';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { externalLinkIcon } from '@b2b-catalog-platform/ui/icons/glyphs/external-link';
import { fileTextIcon } from '@b2b-catalog-platform/ui/icons/glyphs/file-text';
import { sendIcon } from '@b2b-catalog-platform/ui/icons/glyphs/send';
import { uploadIcon } from '@b2b-catalog-platform/ui/icons/glyphs/upload';

/** One line of the list: a document that exists, or a kind that could. */
interface DocumentRow {
  readonly kind: OrderDocumentKind;
  readonly label: string;
  readonly detail: string;
  readonly hint: string;
  /** Null where nothing is supplied or generated: unfiled payment instructions.
   * */
  readonly href: string | null;
  readonly supplied: boolean;
  /** Set where a supplied file was filed against an older version. */
  readonly outdated: string | null;
  /** Whether the customer has already been written to about this file. */
  readonly sent: boolean;
  /** Why it cannot be sent yet (their page is behind its version), or null. */
  readonly behind: string | null;
}

/** An order's documents where it is answered (FR-ORD-05, FR-CART-05). One row
 * per kind: a supplied file replaces the generated summary. The payment row
 * exists only for an invoiced order; on cash it is absent, not disabled. */
@Component({
  selector: 'app-order-documents-panel',
  imports: [Button, IconButton, Icon, ErrorText],
  host: { class: 'block' },
  template: `
    <input
      #fileInput
      type="file"
      class="hidden"
      accept="application/pdf,image/*"
      (change)="onFile($event)"
    />

    <ul class="divide-y divide-edge">
      @for (row of rows(); track row.kind) {
        <li class="py-2 first:pt-0">
          <!-- Name and controls on one line, small print under; the controls
               wrap as a group. -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <ui-icon
              [glyph]="fileTextIcon"
              class="size-4 shrink-0 text-ink-subtle"
            />
            <!-- Name and caption together, so a wrapped group does not separate
                 them. -->
            <span class="min-w-36 flex-1">
              <span class="block truncate">{{ row.label }}</span>
              <span class="block text-xs text-ink-subtle">{{
                row.detail
              }}</span>
            </span>

            <!-- Opening sits beside the name, outside the group: it is about
                 the document, not changing it, and stays on the name's line.
                 -->
            @if (row.href; as href) {
              <a
                uiIconButton
                class="shrink-0"
                [href]="href"
                target="_blank"
                rel="noopener"
                [attr.aria-label]="text.open"
                [title]="text.open"
              >
                <ui-icon [glyph]="externalLinkIcon" />
              </a>
            }

            <!-- Wrapping within the group too: three controls overflow a phone.
                 -->
            @if (!readOnly()) {
              <div class="flex flex-wrap items-center gap-2">
                <button
                  uiButton
                  size="sm"
                  variant="secondary"
                  type="button"
                  class="gap-2"
                  [disabled]="busy() !== null"
                  (click)="choose(row.kind, fileInput)"
                >
                  <ui-icon [glyph]="uploadIcon" class="size-4" />
                  {{
                    busy() === row.kind
                      ? adminText.upload.progress
                      : row.supplied
                        ? text.replace
                        : text.upload
                  }}
                </button>
                @if (row.supplied) {
                  <!-- Sending is its own act, repeatable. Absent while their
                       page is behind its version: they could not open it. -->
                  @if (!row.behind) {
                    <button
                      uiButton
                      size="sm"
                      variant="secondary"
                      type="button"
                      class="gap-2"
                      [disabled]="busy() !== null"
                      (click)="notify(row.kind)"
                    >
                      <ui-icon [glyph]="sendIcon" class="size-4" />
                      {{ row.sent ? text.notifySent : text.notify }}
                    </button>
                  }
                  <button
                    uiButton
                    size="sm"
                    variant="dangerOutline"
                    type="button"
                    [disabled]="busy() !== null"
                    (click)="remove(row.kind)"
                  >
                    {{ actionText.remove }}
                  </button>
                }
              </div>
            }
          </div>

          <!-- Indented to the name, as one entry. -->
          <div class="ps-7">
            <!-- The only warning that a supplied file quotes an older total.
                 -->
            @if (row.outdated; as warning) {
              <p class="text-xs text-warning">{{ warning }}</p>
            }
            <!-- Why there is no send button. -->
            @if (row.behind; as waiting) {
              <p class="mt-1 text-xs text-ink-subtle">{{ waiting }}</p>
            }
          </div>
        </li>
      }
    </ul>

    @if (failed()) {
      <p uiErrorText class="mt-2" role="alert">{{ text.error }}</p>
    }
  `,
})
export class OrderDocumentsPanel {
  protected readonly externalLinkIcon = externalLinkIcon;
  protected readonly fileTextIcon = fileTextIcon;
  protected readonly sendIcon = sendIcon;
  protected readonly uploadIcon = uploadIcon;
  private readonly api = inject(AdminOrdersService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_ORDERING_TEXT).orders.detail.documents;
  protected readonly adminText = inject(ADMIN_TEXT);
  // The size words the document list owns.
  private readonly sizes = inject(SHARED_TEXT).fileSize;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly dayFormat = adminDayFormat(inject(DEPLOYMENT_CONFIG).locale);

  readonly order = input.required<AdminOrderDetail>();
  /** Read-only, on the version screen: acting on the order from a superseded
   * version is refused there as with transitions. The staleness marker reads
   * against the version shown. */
  readonly readOnly = input(false);
  /** The page re-reads the order: staleness is its answer. */
  readonly changed = output<void>();

  protected readonly busy = signal<OrderDocumentKind | null>(null);
  protected readonly failed = signal(false);
  private chosen: OrderDocumentKind | null = null;

  protected readonly rows = computed<DocumentRow[]>(() => {
    const order = this.order();
    const of = (kind: OrderDocumentKind): AdminOrderDocument | undefined =>
      order.documents.find((document) => document.kind === kind);

    const rows: DocumentRow[] = [];
    // Invoiced only.
    if (order.paymentMethod !== 'cash') {
      rows.push(this.row('payment-instructions', of('payment-instructions')));
    }
    rows.push(this.row('order-summary', of('order-summary')));
    // An empty kind invites a supply where a manager can, and is dropped where
    // not.
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
          : `${documentFileCaption(
              {
                contentType: document.contentType as AcceptedDocumentMime,
                byteSize: document.byteSize ?? 0,
              },
              this.sizes,
            )} · ${fillText(this.text.supplied, {
              date: this.day(document.suppliedAt),
            })}`,
      hint,
      href: orderDocumentPath(kind, { reference: order.reference }),
      supplied: document.source === 'supplied',
      // From the row, so it survives a reload.
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

  /** One file input for both rows, so the asking row is remembered. */
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
      ...confirmRequest(this.text.notifyConfirm),
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
      ...confirmRequest(this.text.removeConfirm),
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
    return iso ? this.dayFormat.format(new Date(iso)) : '';
  }
}
