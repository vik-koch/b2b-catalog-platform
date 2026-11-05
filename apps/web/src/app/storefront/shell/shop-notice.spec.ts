import { TestBed } from '@angular/core/testing';
import { ShopNotice as Notice } from '@b2b-catalog-platform/shared/platform';
import type { DeploymentConfigFile } from '@b2b-catalog-platform/shared/deployment';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import { ShopNotice } from './shop-notice';

async function render(notice: Notice | undefined) {
  const deployment: DeploymentConfigFile = {
    ...defaultDeploymentConfig,
    notice,
  };
  TestBed.configureTestingModule({
    imports: [ShopNotice],
    providers: [{ provide: DEPLOYMENT_CONFIG, useValue: deployment }],
  });
  const fixture = TestBed.createComponent(ShopNotice);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ShopNotice', () => {
  it('renders nothing when the deployment sets no notice', async () => {
    const el = await render(undefined);
    expect(el.textContent?.trim()).toBe('');
  });

  it('shows the text alone when the notice has no link', async () => {
    const el = await render({ text: 'Closed until 2 January.' });
    expect(el.querySelector('p')?.textContent?.trim()).toBe(
      'Closed until 2 January.',
    );
    expect(el.querySelector('a')).toBeNull();
  });

  it('follows the text with its link', async () => {
    const el = await render({
      text: 'This is a demonstration shop.',
      link: { label: 'About this demo', url: 'https://example.com/demo' },
    });
    const link = el.querySelector('a');
    expect(link?.textContent?.trim()).toBe('About this demo');
    expect(link?.getAttribute('href')).toBe('https://example.com/demo');
    // A word space between the sentence and the link, not run together.
    expect(
      el.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toBe('This is a demonstration shop. About this demo');
  });
});
