import { TestBed } from '@angular/core/testing';
import {
  DeploymentConfig,
  SiteNotice as Notice,
} from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';
import { SiteNotice } from './site-notice';

async function render(notice: Notice | undefined) {
  const deployment: DeploymentConfig = { ...defaultDeploymentConfig, notice };
  TestBed.configureTestingModule({
    imports: [SiteNotice],
    providers: [{ provide: DEPLOYMENT_CONFIG, useValue: deployment }],
  });
  const fixture = TestBed.createComponent(SiteNotice);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('SiteNotice', () => {
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
