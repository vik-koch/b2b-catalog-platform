import { TestBed } from '@angular/core/testing';
import { Home } from './home';

describe('Home', () => {
  it('renders the placeholder', async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
    }).compileComponents();

    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Wholesale specialty coffee',
    );
  });
});
