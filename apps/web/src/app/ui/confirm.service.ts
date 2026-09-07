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
import { ConfirmDialog } from './confirm-dialog';

export interface ConfirmRequest {
  heading: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: 'primary' | 'danger';
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
   * The same question, with a sentence attached: resolves with the reason, or
   * with null where the answer was no.
   */
  askWithReason(request: ReasonRequest): Promise<string | null> {
    return this.open(request);
  }

  private open(
    request: ConfirmRequest | ReasonRequest,
  ): Promise<string | null> {
    // Nothing to ask on the server, and nothing to answer with: a guard there
    // proceeds, which is what an empty reason means to every caller here.
    if (!this.isBrowser) return Promise.resolve('');

    return new Promise<string | null>((resolve) => {
      const host = document.createElement('div');
      document.body.appendChild(host);

      const ref: ComponentRef<ConfirmDialog> = createComponent(ConfirmDialog, {
        environmentInjector: this.injector,
        hostElement: host,
      });
      ref.setInput('heading', request.heading);
      ref.setInput('message', request.message);
      ref.setInput('confirmLabel', request.confirmLabel);
      ref.setInput('cancelLabel', request.cancelLabel);
      ref.setInput('confirmVariant', request.confirmVariant ?? 'danger');
      if ('reasonLabel' in request) {
        ref.setInput('reasonLabel', request.reasonLabel);
        ref.setInput('reasonMaxLength', request.reasonMaxLength);
        ref.setInput('reasonRequired', request.reasonRequired ?? true);
      }

      const close = (answer: string | null) => {
        ref.destroy();
        host.remove();
        resolve(answer);
      };
      ref.instance.confirmed.subscribe((reason) => close(reason));
      ref.instance.cancelled.subscribe(() => close(null));

      this.appRef.attachView(ref.hostView);
    });
  }
}
