import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmCheck } from './confirm-dialog';
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

/** The same dialog, asked with ticks on it. */
async function askDetailed(checks: ConfirmCheck[]) {
  const answer = TestBed.inject(ConfirmService).askDetailed({
    ...request,
    checks,
  });
  await TestBed.inject(ApplicationRef).whenStable();
  const dialog = document.querySelector('dialog');
  if (!dialog) throw new Error('dialog was not rendered');
  return { answer, dialog, boxes: [...dialog.querySelectorAll('input')] };
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

  /**
   * A tick that hangs off another one. Writing to a customer about a version
   * they are not being shown would send them a link to something they cannot
   * open, so the dialog does not let the two be answered independently.
   */
  describe('a tick that depends on another', () => {
    const checks: ConfirmCheck[] = [
      { key: 'showCustomer', label: 'Show it to them', checked: true },
      {
        key: 'notify',
        label: 'Email them',
        checked: true,
        requires: 'showCustomer',
      },
    ];

    it('clears and disables the dependent tick with the one it needs', async () => {
      const { answer, dialog, boxes } = await askDetailed(checks);

      expect(boxes[1].disabled).toBe(false);
      boxes[0].click();
      await TestBed.inject(ApplicationRef).whenStable();

      expect(boxes[1].disabled).toBe(true);
      expect(boxes[1].checked).toBe(false);
      click(dialog, request.confirmLabel);
      // And what it answers with is what it was showing: a tick that cannot
      // take effect must not come back as one that did.
      expect((await answer)?.checks).toEqual({
        showCustomer: false,
        notify: false,
      });
    });

    it('leaves both as they were offered when nothing is touched', async () => {
      const { answer, dialog } = await askDetailed(checks);

      click(dialog, request.confirmLabel);

      expect((await answer)?.checks).toEqual({
        showCustomer: true,
        notify: true,
      });
    });
  });
});
