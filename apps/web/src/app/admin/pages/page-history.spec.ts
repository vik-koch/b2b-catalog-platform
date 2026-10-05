import { TestBed } from '@angular/core/testing';
import { PageVersion } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { PageService } from '../../pages/page.service';
import { PageHistory } from './page-history';

const text = defaultAdminText.pageEditor.history;

const version = (n: number, extra: Partial<PageVersion> = {}): PageVersion => ({
  version: n,
  title: `Title ${n}`,
  bodyHtml: `<p>Body ${n}.</p>`,
  consentLabel: null,
  updatedAt: '2026-10-04T10:00:00.000Z',
  editorEmail: null,
  ...extra,
});

async function render(versions: PageVersion[]) {
  TestBed.configureTestingModule({
    imports: [PageHistory],
    providers: [
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      {
        provide: PageService,
        useValue: { listVersions: vi.fn().mockResolvedValue(versions) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PageHistory);
  fixture.componentRef.setInput('slug', 'consent-contact');
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('PageHistory', () => {
  it('lists every version newest first and marks the first as current', async () => {
    const el = await render([
      version(2, { editorEmail: 'admin@example.com' }),
      version(1),
    ]);

    const summaries = [...el.querySelectorAll('summary')].map(
      (s) => s.textContent ?? '',
    );
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toContain('2');
    expect(summaries[0]).toContain(text.current);
    expect(summaries[0]).toContain('admin@example.com');
    expect(summaries[1]).not.toContain(text.current);
  });

  it('shows what a version said, box wording included', async () => {
    const el = await render([version(1, { consentLabel: 'I consent.' })]);

    expect(el.querySelector('.prose')?.innerHTML).toContain('Body 1.');
    expect(el.textContent).toContain('I consent.');
  });

  it('renders nothing for a page never saved', async () => {
    const el = await render([]);

    expect(el.querySelector('section')).toBeNull();
  });
});
