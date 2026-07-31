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

  ask(request: ConfirmRequest): Promise<boolean> {
    if (!this.isBrowser) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
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

      const close = (answer: boolean) => {
        ref.destroy();
        host.remove();
        resolve(answer);
      };
      ref.instance.confirmed.subscribe(() => close(true));
      ref.instance.cancelled.subscribe(() => close(false));

      this.appRef.attachView(ref.hostView);
    });
  }
}
