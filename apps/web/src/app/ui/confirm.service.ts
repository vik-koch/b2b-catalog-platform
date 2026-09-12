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
  /** A consequence worth weighing before answering yes — drawn amber under the
   * question, and never a refusal. */
  warning?: string;
  cancelLabel: string;
  confirmVariant?: 'primary' | 'danger';
  /** What happens *because* the answer is yes, each offered as a tick with the
   * usual answer already filled in. */
  checks?: readonly ConfirmCheck[];
}

/** A confirmation that may say why. Required by default, because the usual
 * case is a reason quoted at somebody; optional where it is a courtesy to the
 * reader rather than an explanation owed to them. */
export interface ReasonRequest extends ConfirmRequest {
  reasonLabel: string;
  reasonMaxLength: number;
  reasonRequired?: boolean;
}

/**
 * Asks the user a yes/no question and resolves with the answer.
 * The dialog is created imperatively and attached to `<body>` rather than
 * declared in a host template: callers (canDeactivate guards especially) have
 * no template of their own, and the modal belongs in the top layer regardless.
 * On the server there is nothing to ask, so it answers "yes" — guards only ever
 * run in the browser anyway.
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
   * States something and waits for it to be read — the same modal with nothing
   * to answer. For a control that refuses rather than acts: the button stays
   * where it is and says why it will not work, which is what the product
   * delete dialog does while the catalog is owned elsewhere.
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

  /**
   * The whole answer — the reason, and how the ticks were left — for a caller
   * that offered choices. `ask` and `askWithReason` are this with the parts
   * they do not use dropped.
   */
  askDetailed(
    request: ConfirmRequest | ReasonRequest,
  ): Promise<ConfirmAnswer | null> {
    return this.open(request);
  }

  private open(
    request: ConfirmRequest | ReasonRequest,
  ): Promise<ConfirmAnswer | null> {
    // Nothing to ask on the server, and nothing to answer with: a guard there
    // proceeds, and every choice stands as it was offered.
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
