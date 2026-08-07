import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { DeploymentConfig } from '../config/deployment-config.type';
import { CompanyIdField } from './company-id-field';

const vat = {
  key: 'vat',
  label: 'VAT number',
  pattern: '^DE[0-9]{9}$',
  prefix: 'DE',
  mask: '#########',
  example: 'DE123456789',
};

/** A jurisdiction that takes two shapes, neither with a prefix. */
const soleTrader = {
  key: 'sole',
  label: 'Sole trader',
  pattern: '^[0-9]{10}$',
  mask: '##########',
  example: '1234567890',
};
const company = {
  key: 'company',
  label: 'Company',
  pattern: '^[0-9]{12}$',
  mask: '############',
  example: '123456789012',
};

const text = {
  required: 'A registration number is required.',
  format: 'Please enter it in the form {example}.',
  formatLabel: 'Kind of registration number',
};

@Component({
  imports: [ReactiveFormsModule, CompanyIdField],
  template: `
    <app-company-id-field
      [control]="control"
      [formatControl]="formatControl"
      label="Registration number"
      [text]="text"
      [invalid]="invalid()"
    />
  `,
})
class Host {
  control = new FormControl('', { nonNullable: true });
  formatControl = new FormControl('', { nonNullable: true });
  invalid = signal(false);
  text = text;
}

async function render(
  formats: Record<string, unknown>[],
  { selected = formats[0]['key'] as string, value = '' } = {},
) {
  const config = {
    ...defaultDeploymentConfig,
    companyIdInput: { formats },
  } as unknown as DeploymentConfig;

  TestBed.configureTestingModule({
    imports: [Host],
    providers: [{ provide: DEPLOYMENT_CONFIG, useValue: config }],
  });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.formatControl.setValue(selected);
  host.control.setValue(value);
  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const input = () =>
    el.querySelector('#companyRegistrationId') as HTMLInputElement;
  const select = () => el.querySelector('select') as HTMLSelectElement | null;

  const choose = async (key: string) => {
    const picker = select();
    if (!picker) throw new Error('no format picker rendered');
    picker.value = key;
    picker.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };
  const type = async (raw: string) => {
    input().value = raw;
    input().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  return { fixture, el, host, input, select, choose, type };
}

describe('CompanyIdField', () => {
  describe('with one configured format', () => {
    it('draws no picker — there is nothing to ask', async () => {
      const { select } = await render([vat]);

      expect(select()).toBeNull();
    });

    it('shows the format prefix and its example as the hint', async () => {
      const { el } = await render([vat]);

      expect(el.textContent).toContain('DE');
      expect(el.textContent).toContain(
        'Please enter it in the form DE123456789.',
      );
    });

    it('masks what is typed, leaving the prefix out of the control', async () => {
      const { host, type, input } = await render([vat]);

      await type('123456789');

      expect(input().value).toBe('123456789');
      // The prefix is composed in on submit, never held in the field.
      expect(host.control.value).toBe('123456789');
    });
  });

  describe('with several configured formats', () => {
    it('offers each one by its label', async () => {
      const { select } = await render([soleTrader, company]);

      expect(
        [...(select()?.options ?? [])].map((o) => o.textContent?.trim()),
      ).toEqual(['Sole trader', 'Company']);
    });

    it('hints with the chosen format, not with all of them', async () => {
      const { el, choose } = await render([soleTrader, company]);

      expect(el.textContent).toContain('in the form 1234567890.');

      await choose('company');

      expect(el.textContent).toContain('in the form 123456789012.');
      expect(el.textContent).not.toContain('in the form 1234567890.');
    });

    /**
     * The whole reason the picker exists: one mask cannot serve both, because a
     * mask caps entry at its own length. Twelve digits are unreachable while
     * the ten-digit shape is selected.
     */
    it('lets the longer format take more digits than the shorter one', async () => {
      const { host, type, choose, input } = await render([soleTrader, company]);

      await type('123456789012');
      expect(input().value).toBe('1234567890');

      await choose('company');
      await type('123456789012');

      expect(input().value).toBe('123456789012');
      expect(host.control.value).toBe('123456789012');
    });

    // Visibly, in front of the visitor — unlike a silent truncation on load,
    // which is what the format-of-a-stored-value rule exists to prevent.
    it('regroups what was already typed when the format changes', async () => {
      const { host, type, choose } = await render([soleTrader, company]);

      await type('123456789012');
      await choose('company');
      expect(host.control.value).toBe('1234567890');

      await choose('sole');
      expect(host.control.value).toBe('1234567890');
    });

    it('names the picker for a screen reader', async () => {
      const { select } = await render([soleTrader, company]);

      expect(select()?.getAttribute('aria-label')).toBe(
        'Kind of registration number',
      );
    });
  });

  /**
   * A number from before the current config, or from an import. Masking it
   * would truncate it, and the save would then store the truncation — so the
   * field wears no shape it does not have.
   */
  it('shows a value in no configured shape unmasked and unprefixed', async () => {
    const { el, input } = await render([vat], {
      selected: '',
      value: 'XX-9999',
    });

    expect(input().value).toBe('XX-9999');
    expect(el.querySelector('span[appFieldPrefix]')).toBeNull();
  });
});
