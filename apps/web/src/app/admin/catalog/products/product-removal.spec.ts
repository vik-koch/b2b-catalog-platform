import type { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { purgeWithConfirmation, type PurgeText } from './product-removal';

const text: PurgeText = {
  purgeProduct: 'Delete permanently',
  purgeConfirm: {
    heading: 'Delete permanently?',
    message: '“{name}” cannot be brought back.',
    confirm: 'Delete',
  },
  cancel: 'Cancel',
  close: 'Close',
  owned: 'The source still sends it.',
  errors: { 'product-ordered': 'Somebody ordered it.' },
};
const product = { slug: 'old-roast', name: 'Old roast' };

function confirmWith(answer: boolean) {
  return {
    ask: vi.fn(async () => answer),
    tell: vi.fn(async () => undefined),
  };
}

describe('purgeWithConfirmation', () => {
  it('names the product in the question and deletes once confirmed', async () => {
    const confirm = confirmWith(true);
    const purge = vi.fn(async () => ({ ok: true as const }));

    const gone = await purgeWithConfirmation(
      confirm as unknown as ConfirmService,
      { purge },
      text,
      product,
    );

    expect(confirm.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '“Old roast” cannot be brought back.',
        confirmVariant: 'danger',
      }),
    );
    expect(purge).toHaveBeenCalledWith('old-roast');
    expect(gone).toBe(true);
  });

  it('leaves the product alone when the question is declined', async () => {
    const purge = vi.fn();

    const gone = await purgeWithConfirmation(
      confirmWith(false) as unknown as ConfirmService,
      { purge },
      text,
      product,
    );

    expect(purge).not.toHaveBeenCalled();
    expect(gone).toBe(false);
  });

  it('tells a refusal the list could not foresee', async () => {
    const confirm = confirmWith(true);
    const purge = vi.fn(async () => ({
      ok: false as const,
      code: 'product-ordered' as const,
    }));

    const gone = await purgeWithConfirmation(
      confirm as unknown as ConfirmService,
      { purge },
      text,
      product,
    );

    expect(confirm.tell).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Somebody ordered it.' }),
    );
    expect(gone).toBe(false);
  });
});
