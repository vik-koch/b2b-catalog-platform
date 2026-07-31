import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm.service';

// jsdom's <dialog> has no showModal/close; the dialog opens itself on render.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

const request = {
  heading: 'Discard changes?',
  message: 'Discard your unsaved changes?',
  confirmLabel: 'Discard changes',
  cancelLabel: 'Keep editing',
};

async function ask() {
  const answer = TestBed.inject(ConfirmService).ask(request);
  await TestBed.inject(ApplicationRef).whenStable();
  const dialog = document.querySelector('dialog');
  if (!dialog) throw new Error('dialog was not rendered');
  return { answer, dialog };
}

function click(dialog: Element, label: string): void {
  const button = [...dialog.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no "${label}" button`);
  button.click();
}

describe('ConfirmService', () => {
  it('resolves true when the confirm button is clicked', async () => {
    const { answer, dialog } = await ask();

    click(dialog, request.confirmLabel);

    expect(await answer).toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('resolves false when the cancel button is clicked', async () => {
    const { answer, dialog } = await ask();

    click(dialog, request.cancelLabel);

    expect(await answer).toBe(false);
  });

  it('resolves false when the dialog is dismissed with Esc', async () => {
    const { answer, dialog } = await ask();

    dialog.dispatchEvent(new Event('cancel'));

    expect(await answer).toBe(false);
  });
});
