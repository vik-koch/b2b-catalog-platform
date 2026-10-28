import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ConfirmAnswer, ConfirmCheck, ConfirmDialog } from './confirm-dialog';

export interface ConfirmRequest {
  heading: string;
  message: string;
  /** Null on a dialog that only explains: there is nothing to answer yes to. */
  confirmLabel: string | null;
  /** A consequence to weigh before answering yes; never a refusal. */
  warning?: string;
  cancelLabel: string;
  confirmVariant?: 'primary' | 'danger';
  /** What happens because the answer is yes, each offered as a tick. */
  checks?: readonly ConfirmCheck[];
}

/** A dialog's words as the text files write them. */
export interface ConfirmText {
  readonly heading: string;
  readonly message: string;
  readonly confirm: string;
  readonly cancel?: string;
  readonly warning?: string;
}

/** The request for those words; `cancel` stands in where they name none. */
export function confirmRequest(text: ConfirmText, cancel = ''): ConfirmRequest {
  return {
    heading: text.heading,
    message: text.message,
    confirmLabel: text.confirm,
    cancelLabel: text.cancel ?? cancel,
  };
}

/** A confirmation that may say why; the reason is required unless said otherwise. */
export interface ReasonRequest extends ConfirmRequest {
  reasonLabel: string;
  reasonMaxLength: number;
  reasonRequired?: boolean;
}

/**
 * Asks a yes/no question and resolves with the answer. The dialog is attached
 * to `<body>`, since callers such as guards have no template. On the server
 * there is nothing to ask, so it answers yes.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  async ask(request: ConfirmRequest): Promise<boolean> {
    return (await this.open(request)) !== null;
  }

  /**
   * States something and waits for it to be read: for a control that refuses
   * rather than acts, saying why.
   */
  async tell(request: {
    heading: string;
    message: string;
    closeLabel: string;
  }): Promise<void> {
    await this.open({
      heading: request.heading,
      message: request.message,
      confirmLabel: null,
      cancelLabel: request.closeLabel,
    });
  }

  /**
   * The same question, with a sentence attached: resolves with the reason, or
   * with null where the answer was no.
   */
  async askWithReason(request: ReasonRequest): Promise<string | null> {
    return (await this.open(request))?.reason ?? null;
  }

  /** The whole answer, for a caller that offered choices. */
  askDetailed(
    request: ConfirmRequest | ReasonRequest,
  ): Promise<ConfirmAnswer | null> {
    return this.open(request);
  }

  private open(
    request: ConfirmRequest | ReasonRequest,
  ): Promise<ConfirmAnswer | null> {
    // On the server a guard proceeds, and every choice stands as offered.
    if (!this.isBrowser) {
      return Promise.resolve({
        reason: '',
        checks: Object.fromEntries(
          (request.checks ?? []).map((check) => [check.key, check.checked]),
        ),
      });
    }

    return new Promise<ConfirmAnswer | null>((resolve) => {
      const host = document.createElement('div');
      document.body.appendChild(host);

      const ref: ComponentRef<ConfirmDialog> = createComponent(ConfirmDialog, {
        environmentInjector: this.injector,
        hostElement: host,
      });
      ref.setInput('heading', request.heading);
      ref.setInput('message', request.message);
      ref.setInput('warning', request.warning ?? null);
      ref.setInput('confirmLabel', request.confirmLabel);
      ref.setInput('cancelLabel', request.cancelLabel);
      ref.setInput('confirmVariant', request.confirmVariant ?? 'danger');
      ref.setInput('checks', request.checks ?? []);
      if ('reasonLabel' in request) {
        ref.setInput('reasonLabel', request.reasonLabel);
        ref.setInput('reasonMaxLength', request.reasonMaxLength);
        ref.setInput('reasonRequired', request.reasonRequired ?? true);
      }

      const close = (answer: ConfirmAnswer | null) => {
        ref.destroy();
        host.remove();
        resolve(answer);
      };
      ref.instance.confirmed.subscribe((answer) => close(answer));
      ref.instance.cancelled.subscribe(() => close(null));

      this.appRef.attachView(ref.hostView);
    });
  }
}
