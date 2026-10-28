import {
  Directive,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * A file-picking control that also takes a file dropped on it or pasted on the
 * page, handed over as the picker would have.
 *
 * A paste is taken only when nothing else wants it: not one aimed at a text
 * field or already handled. It is filtered by `accept`, since a clipboard
 * carries more than was copied (spreadsheet cells arrive with a picture of
 * themselves). A drop is not: it was aimed here, and the upload's refusal
 * says more than ignoring it would.
 *
 *   <button [uiFileTarget]="accept" (filesReceived)="upload($event)">
 */
@Directive({
  selector: '[uiFileTarget]',
  exportAs: 'uiFileTarget',
  host: {
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'dragging.set(false)',
    '(drop)': 'onDrop($event)',
    '(document:paste)': 'onPaste($event)',
  },
})
export class FileTarget {
  private readonly el =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** What it takes, as an `<input accept>` lists it; empty takes anything. */
  readonly accept = input('', { alias: 'uiFileTarget' });
  /** Hand over every file, not only the first. */
  readonly fileTargetMultiple = input(false);
  readonly filesReceived = output<File[]>();

  /** Whether a file is being dragged over it. */
  readonly dragging = signal(false);

  protected onDragOver(event: DragEvent): void {
    // Without preventDefault the browser navigates to the dropped file.
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.disabled()) return;
    this.hand([...(event.dataTransfer?.files ?? [])]);
  }

  protected onPaste(event: ClipboardEvent): void {
    if (event.defaultPrevented || this.disabled()) return;
    if (isTextEntry(event.target)) return;
    const accept = this.accept();
    const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
      accepts(accept, file),
    );
    if (files.length === 0) return;
    // Taken: a second target on the page, or the browser, leaves it be.
    event.preventDefault();
    this.hand(files);
  }

  private hand(files: File[]): void {
    if (files.length === 0) return;
    this.filesReceived.emit(
      this.fileTargetMultiple() ? files : files.slice(0, 1),
    );
  }

  /** Disabled while it uploads, or not on screen (a folded section). */
  private disabled(): boolean {
    if ((this.el as HTMLButtonElement).disabled) return true;
    // Absent in the test DOM, which lays nothing out.
    return typeof this.el.checkVisibility === 'function'
      ? !this.el.checkVisibility()
      : false;
  }
}

const NOT_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Where a paste means text: a field, or anything editable in place. Not a
 * checkbox or a select: a paste after ticking an option is meant for the page.
 */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NOT_TEXT_INPUTS.has(target.type);
  }
  return target.isContentEditable;
}

/** The browser's own reading of `accept`: a `.ext`, a `type/*`, or a type. */
export function accepts(accept: string, file: File): boolean {
  const tokens = accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

/** The paste shortcut as this machine's keyboard writes it. */
export function pasteKeys(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Mac|iPhone|iPad/.test(platform) ? '⌘V' : 'Ctrl+V';
}
