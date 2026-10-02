import {
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
} from '@angular/core';
import { ImageFramerDialog } from './image-framer-dialog';

/** What the framer answers with: the framed picture, the picture untouched,
 * or null where it was cancelled. */
export type FramerAnswer = Blob | 'original' | null;

/**
 * Opens the framer on a picture and resolves once it is answered. Attached to
 * `<body>` as ConfirmService's dialog is, so a caller needs no template slot.
 */
@Injectable({ providedIn: 'root' })
export class ImageFramerService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  frame(src: string, offerOriginal: boolean): Promise<FramerAnswer> {
    return new Promise<FramerAnswer>((resolve) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const ref = createComponent(ImageFramerDialog, {
        environmentInjector: this.injector,
        hostElement: host,
      });
      ref.setInput('src', src);
      ref.setInput('offerOriginal', offerOriginal);

      const close = (answer: FramerAnswer) => {
        ref.destroy();
        host.remove();
        resolve(answer);
      };
      ref.instance.framed.subscribe((blob) => close(blob));
      ref.instance.original.subscribe(() => close('original'));
      ref.instance.cancelled.subscribe(() => close(null));

      this.appRef.attachView(ref.hostView);
    });
  }
}
