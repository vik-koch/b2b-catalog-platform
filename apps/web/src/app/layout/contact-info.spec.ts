import { TestBed } from '@angular/core/testing';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { ContactInfo } from './contact-info';

async function render(contact: DeploymentConfig['contact']) {
  const config: DeploymentConfig = {
    branding: { name: 'Test', logo: '/logo.svg', title: 'Test' },
    cookieConsentEnabled: false,
    locations: [],
    contact,
  };
  TestBed.configureTestingModule({
    imports: [ContactInfo],
    providers: [{ provide: DEPLOYMENT_CONFIG, useValue: config }],
  });
  const fixture = TestBed.createComponent(ContactInfo);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function hrefs(el: HTMLElement): (string | null)[] {
  return Array.from(el.querySelectorAll('a')).map((a) =>
    a.getAttribute('href'),
  );
}

describe('ContactInfo', () => {
  it('renders phone and email as tel:/mailto: links when both are set', async () => {
    const el = await render({ phone: '+49 40 1234567', email: 'a@b.example' });

    expect(hrefs(el)).toContain('tel:+49401234567'); // dial chars only
    expect(hrefs(el)).toContain('mailto:a@b.example');
    expect(el.textContent).toContain('+49 40 1234567'); // display keeps spacing
  });

  it('shows only the phone when email is not configured', async () => {
    const el = await render({ phone: '+49 40 1234567' });
    expect(hrefs(el)).toEqual(['tel:+49401234567']);
  });

  it('shows only the email when phone is not configured', async () => {
    const el = await render({ email: 'a@b.example' });
    expect(hrefs(el)).toEqual(['mailto:a@b.example']);
  });

  it('renders nothing when no contact is configured', async () => {
    const el = await render(undefined);
    expect(hrefs(el)).toEqual([]);
  });
});
